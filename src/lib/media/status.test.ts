import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  checkAvailability: vi.fn(),
  claimMediaProbeLease: vi.fn(),
  getMediaById: vi.fn(),
  updateMediaAvailability: vi.fn(),
  markMediaFailed: vi.fn(),
  releaseMediaProbeLease: vi.fn()
}))

vi.mock('./factory', () => ({
  getMediaStorageFor: () => ({ probe: mocks.checkAvailability })
}))
vi.mock('./repository', () => ({
  claimMediaProbeLease: mocks.claimMediaProbeLease,
  getMediaById: mocks.getMediaById,
  updateMediaAvailability: mocks.updateMediaAvailability,
  markMediaFailed: mocks.markMediaFailed,
  releaseMediaProbeLease: mocks.releaseMediaProbeLease
}))

import { getMediaProbeLeaseMs, getMediaProcessingExpiresAt, refreshMediaStatus } from './status'

const startedAt = '2026-07-13T00:00:00.000Z'
const base = {
  id: 'a'.repeat(64),
  path: `uploads/blog/aa/${'a'.repeat(64)}.png`,
  locator: { owner: 'owner', repo: 'images', branch: 'main', pathPrefix: 'uploads/blog' },
  status: 'processing',
  createdAt: startedAt,
  processingStartedAt: startedAt,
  availabilityCheckedAt: '2026-07-13T00:00:01.000Z'
}

describe('media processing status', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-13T00:01:01.000Z'))
    vi.stubEnv('MEDIA_PROCESSING_TIMEOUT_SECONDS', '60')
    vi.stubEnv('MEDIA_PROBE_LEASE_SECONDS', '15')
    vi.clearAllMocks()
    mocks.releaseMediaProbeLease.mockResolvedValue(base)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('uses a stable deadline based on processing start time', () => {
    expect(getMediaProcessingExpiresAt(base as never)).toBe('2026-07-13T00:01:00.000Z')
    expect(getMediaProbeLeaseMs()).toBe(15_000)
  })

  it('marks an unavailable asset failed after one final deadline probe', async () => {
    const processing = { ...base, availabilityCheckedAt: '2026-07-13T00:00:58.000Z' }
    const refreshed = { ...processing, availabilityCheckedAt: '2026-07-13T00:01:01.000Z' }
    const failed = { ...refreshed, status: 'failed' }
    mocks.getMediaById.mockResolvedValue(processing)
    mocks.claimMediaProbeLease.mockResolvedValue({ acquired: true, asset: processing })
    mocks.checkAvailability.mockResolvedValue({ available: false, checkedAt: refreshed.availabilityCheckedAt })
    mocks.markMediaFailed.mockResolvedValue(failed)

    await expect(refreshMediaStatus(base.id, 'request')).resolves.toEqual(failed)
    const leaseToken = mocks.claimMediaProbeLease.mock.calls[0][0].token
    expect(mocks.markMediaFailed).toHaveBeenCalledWith(
      base.id,
      leaseToken,
      'MEDIA_PROCESSING_TIMEOUT',
      expect.stringContaining('processing deadline'),
      refreshed.availabilityCheckedAt
    )
    expect(mocks.updateMediaAvailability).not.toHaveBeenCalled()
  })

  it('does not keep probing a terminal failed asset', async () => {
    const failed = { ...base, status: 'failed' }
    mocks.getMediaById.mockResolvedValue(failed)

    await expect(refreshMediaStatus(base.id, 'request')).resolves.toEqual(failed)
    expect(mocks.checkAvailability).not.toHaveBeenCalled()
    expect(mocks.claimMediaProbeLease).not.toHaveBeenCalled()
  })

  it('allows only the lease winner to execute an external probe', async () => {
    vi.setSystemTime(new Date('2026-07-13T00:00:30.000Z'))
    const processing = { ...base, availabilityCheckedAt: '2026-07-13T00:00:01.000Z' }
    const ready = {
      ...processing,
      status: 'ready',
      url: 'https://img.example.test/image.png',
      processingStartedAt: null
    }
    let resolveProbe!: (value: { available: boolean; checkedAt: string; url: string; candidateKind: string }) => void
    const probe = new Promise<{ available: boolean; checkedAt: string; url: string; candidateKind: string }>(resolve => {
      resolveProbe = resolve
    })
    mocks.getMediaById.mockResolvedValue(processing)
    mocks.claimMediaProbeLease
      .mockResolvedValueOnce({ acquired: true, asset: processing })
      .mockResolvedValueOnce({ acquired: false, asset: processing })
    mocks.checkAvailability.mockReturnValue(probe)
    mocks.updateMediaAvailability.mockResolvedValue(ready)

    const winner = refreshMediaStatus(base.id, 'winner')
    await vi.waitFor(() => expect(mocks.checkAvailability).toHaveBeenCalledOnce())
    const follower = refreshMediaStatus(base.id, 'follower')

    await expect(follower).resolves.toEqual(processing)
    expect(mocks.checkAvailability).toHaveBeenCalledOnce()
    resolveProbe({
      available: true,
      checkedAt: '2026-07-13T00:00:31.000Z',
      url: ready.url,
      candidateKind: 'custom-cdn'
    })
    await expect(winner).resolves.toEqual(ready)
    const winningToken = mocks.claimMediaProbeLease.mock.calls[0][0].token
    expect(mocks.updateMediaAvailability).toHaveBeenCalledWith(
      base.id,
      winningToken,
      expect.objectContaining({ available: true })
    )
  })

  it('returns the current ready row when a late false result loses its lease CAS', async () => {
    vi.setSystemTime(new Date('2026-07-13T00:00:30.000Z'))
    const processing = { ...base, availabilityCheckedAt: '2026-07-13T00:00:01.000Z' }
    const ready = { ...processing, status: 'ready', url: 'https://img.example.test/image.png' }
    mocks.getMediaById.mockResolvedValueOnce(processing).mockResolvedValueOnce(ready)
    mocks.claimMediaProbeLease.mockResolvedValue({ acquired: true, asset: processing })
    mocks.checkAvailability.mockResolvedValue({
      available: false,
      checkedAt: '2026-07-13T00:00:31.000Z'
    })
    mocks.updateMediaAvailability.mockResolvedValue(null)

    await expect(refreshMediaStatus(base.id, 'late')).resolves.toEqual(ready)
    expect(mocks.markMediaFailed).not.toHaveBeenCalled()
  })

  it('does not let a late true result overwrite a concurrently deleted asset', async () => {
    vi.setSystemTime(new Date('2026-07-13T00:00:30.000Z'))
    const processing = { ...base, availabilityCheckedAt: '2026-07-13T00:00:01.000Z' }
    const deleted = {
      ...processing,
      status: 'deleted',
      deletedAt: '2026-07-13T00:00:29.000Z'
    }
    mocks.getMediaById.mockResolvedValueOnce(processing).mockResolvedValueOnce(deleted)
    mocks.claimMediaProbeLease.mockResolvedValue({ acquired: true, asset: processing })
    mocks.checkAvailability.mockResolvedValue({
      available: true,
      checkedAt: '2026-07-13T00:00:31.000Z',
      url: 'https://img.example.test/image.png',
      candidateKind: 'custom-cdn'
    })
    mocks.updateMediaAvailability.mockResolvedValue(null)

    await expect(refreshMediaStatus(base.id, 'late')).resolves.toEqual(deleted)
  })

  it('does not let a late timeout overwrite a concurrently ready asset', async () => {
    const processing = { ...base, availabilityCheckedAt: '2026-07-13T00:00:58.000Z' }
    const ready = { ...processing, status: 'ready', url: 'https://img.example.test/image.png' }
    mocks.getMediaById.mockResolvedValueOnce(processing).mockResolvedValueOnce(ready)
    mocks.claimMediaProbeLease.mockResolvedValue({ acquired: true, asset: processing })
    mocks.checkAvailability.mockResolvedValue({
      available: false,
      checkedAt: '2026-07-13T00:01:01.000Z'
    })
    mocks.markMediaFailed.mockResolvedValue(null)

    await expect(refreshMediaStatus(base.id, 'late')).resolves.toEqual(ready)
  })

  it('conditionally releases its lease when probing throws', async () => {
    vi.setSystemTime(new Date('2026-07-13T00:00:30.000Z'))
    const processing = { ...base, availabilityCheckedAt: '2026-07-13T00:00:01.000Z' }
    mocks.getMediaById.mockResolvedValue(processing)
    mocks.claimMediaProbeLease.mockResolvedValue({ acquired: true, asset: processing })
    mocks.checkAvailability.mockRejectedValue(new Error('probe failed'))

    await expect(refreshMediaStatus(base.id, 'request')).rejects.toThrow('probe failed')
    const leaseToken = mocks.claimMediaProbeLease.mock.calls[0][0].token
    expect(mocks.releaseMediaProbeLease).toHaveBeenCalledWith(base.id, leaseToken)
  })
})
