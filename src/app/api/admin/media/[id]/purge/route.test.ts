import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  requireAdminSession: vi.fn(),
  getMediaById: vi.fn(),
  claimMediaPurge: vi.fn(),
  removeClaimedMediaRecord: vi.fn(),
  getMediaReferences: vi.fn(),
  deleteObject: vi.fn()
}))

vi.mock('@/lib/admin/session', () => ({ requireAdminSession: mocks.requireAdminSession }))
vi.mock('@/lib/media/repository', () => ({
  getMediaById: mocks.getMediaById,
  claimMediaPurge: mocks.claimMediaPurge,
  removeClaimedMediaRecord: mocks.removeClaimedMediaRecord
}))
vi.mock('@/lib/media/references', () => ({ getMediaReferences: mocks.getMediaReferences }))
vi.mock('@/lib/media/factory', () => ({
  getMediaStorageFor: () => ({ delete: mocks.deleteObject })
}))

import { POST } from '@/app/api/admin/media/[id]/purge/route'

const id = 'c'.repeat(64)

function request() {
  return new NextRequest(`http://localhost/api/admin/media/${id}/purge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedHash: id })
  })
}

function context() {
  return { params: Promise.resolve({ id }) }
}

describe('POST /api/admin/media/[id]/purge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('MEDIA_PURGE_ENABLED', 'true')
    mocks.requireAdminSession.mockResolvedValue({ login: 'admin' })
    const asset = {
      id,
      sha256: id,
      path: `uploads/blog/cc/${id}.png`,
      locator: { owner: 'owner', repo: 'images', branch: 'main', pathPrefix: 'uploads/blog' },
      deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1_000).toISOString()
    }
    mocks.getMediaById.mockResolvedValue(asset)
    mocks.claimMediaPurge.mockResolvedValue(asset)
    mocks.removeClaimedMediaRecord.mockResolvedValue(true)
    mocks.getMediaReferences.mockResolvedValue({ count: 0, scannedAt: '2026-07-13T00:00:00.000Z', items: [], truncated: false })
    mocks.deleteObject.mockResolvedValue({ deleted: true })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is disabled unless the destructive operation is explicitly enabled', async () => {
    vi.stubEnv('MEDIA_PURGE_ENABLED', 'false')

    const response = await POST(request(), context())
    expect(response.status).toBe(403)
    expect(mocks.getMediaById).not.toHaveBeenCalled()
    expect(mocks.deleteObject).not.toHaveBeenCalled()
  })

  it('fails closed when any draft, body, or cover reference exists', async () => {
    mocks.getMediaReferences.mockResolvedValue({
      count: 1,
      scannedAt: '2026-07-13T00:00:00.000Z',
      items: [{ slug: 'draft', locale: 'zh', field: 'cover', draft: true }],
      truncated: false
    })

    const response = await POST(request(), context())
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.error.code).toBe('MEDIA_IN_USE')
    expect(mocks.deleteObject).not.toHaveBeenCalled()
    expect(mocks.claimMediaPurge).not.toHaveBeenCalled()
    expect(mocks.removeClaimedMediaRecord).not.toHaveBeenCalled()
  })

  it('purges only after hash, grace period, and live reference checks pass', async () => {
    const response = await POST(request(), context())
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      success: true,
      purged: true,
      providerDeleted: true,
      erasure: {
        currentBranchObjectRemoved: true,
        registryRecordRemoved: true,
        gitHistoryErased: false,
        cdnCacheErasureGuaranteed: false
      }
    })
    expect(mocks.claimMediaPurge).toHaveBeenCalledWith({
      id,
      deletedAt: expect.any(String),
      token: expect.any(String),
      leaseMs: 120_000
    })
    expect(mocks.deleteObject).toHaveBeenCalledWith({
      path: `uploads/blog/cc/${id}.png`,
      expectedSha256: id,
      requestId: expect.any(String)
    })
    expect(mocks.removeClaimedMediaRecord).toHaveBeenCalledWith(id, expect.any(String))
  })

  it('does not touch the provider when restore or another purge wins the database claim', async () => {
    mocks.claimMediaPurge.mockResolvedValue(null)

    const response = await POST(request(), context())
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.error.code).toBe('MEDIA_PURGE_NOT_ALLOWED')
    expect(mocks.deleteObject).not.toHaveBeenCalled()
    expect(mocks.removeClaimedMediaRecord).not.toHaveBeenCalled()
  })

  it('fails closed when purge ownership changes after the provider operation', async () => {
    mocks.removeClaimedMediaRecord.mockResolvedValue(false)

    const response = await POST(request(), context())
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.error.code).toBe('MEDIA_PURGE_NOT_ALLOWED')
    expect(mocks.deleteObject).toHaveBeenCalledOnce()
  })
})
