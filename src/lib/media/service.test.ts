import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'
import type { MediaConfig } from './config'
import type { MediaRateLimiter } from './rate-limit'
import { MediaUploadService } from './service'
import type { MediaStorage } from './storage'

const config: MediaConfig = {
  github: { owner: 'owner', repo: 'images', branch: 'main', token: 'test' },
  pathPrefix: 'uploads/blog',
  requestTimeoutMs: 1_000,
  maxRetries: 0,
  rotationThreshold: 0,
  repoPrefix: 'test-images',
  limits: {
    maxInputBytes: 1_000_000,
    maxOutputBytes: 1_000_000,
    maxWidth: 1_000,
    maxHeight: 1_000,
    maxPixelsPerFrame: 1_000_000,
    maxTotalPixels: 1_000_000,
    maxFrames: 10
  }
}

async function png(): Promise<Buffer> {
  return sharp({
    create: {
      width: 8,
      height: 6,
      channels: 3,
      background: { r: 10, g: 20, b: 30 }
    }
  }).png().toBuffer()
}

describe('MediaUploadService', () => {
  it('reserves rate-limit capacity before accepting bytes and cannot reuse a reservation', async () => {
    const consume = vi.fn().mockResolvedValue({ remaining: 1, resetAt: '' })
    const service = new MediaUploadService(config, {
      provider: 'github',
      put: vi.fn(),
      delete: vi.fn(),
      buildCandidates: vi.fn(),
      probe: vi.fn()
    }, { consume })

    const reservation = await service.reserve({ actor: 'admin', ip: '203.0.113.10' })
    expect(consume).toHaveBeenCalledOnce()
    await expect(reservation.upload({
      buffer: Buffer.alloc(0),
      declaredMimeType: 'image/png',
      originalName: 'empty.png',
      requestId: 'request-reserved'
    })).rejects.toMatchObject({ code: 'MEDIA_INVALID_INPUT' })
    await expect(reservation.upload({
      buffer: Buffer.alloc(0),
      declaredMimeType: 'image/png',
      originalName: 'empty.png',
      requestId: 'request-reused'
    })).rejects.toMatchObject({ code: 'MEDIA_INVALID_INPUT', status: 409 })
    expect(consume).toHaveBeenCalledOnce()
  })

  it('rate-limits, normalizes, stores, probes, and returns a unified asset', async () => {
    const consume = vi.fn().mockResolvedValue({ remaining: 2, resetAt: new Date().toISOString() })
    const consumeBytes = vi.fn().mockResolvedValue({ remaining: 1_000, resetAt: new Date().toISOString() })
    const rateLimiter: MediaRateLimiter = { consume, consumeBytes }
    const put = vi.fn(async input => ({
      path: input.path,
      provider: 'github' as const,
      created: true,
      providerObjectId: 'blob-sha'
    }))
    const storage: MediaStorage = {
      provider: 'github',
      put,
      delete: vi.fn(),
      buildCandidates: path => [{ kind: 'github-raw', url: `https://raw.example.test/${path}` }],
      probe: async path => ({
        available: true,
        checkedAt: '2026-07-13T12:00:00.000Z',
        url: `https://raw.example.test/${path}`,
        candidateKind: 'github-raw'
      })
    }
    const service = new MediaUploadService(config, storage, rateLimiter)

    const asset = await service.upload({
      buffer: await png(),
      declaredMimeType: 'image/png',
      originalName: '中文封面.png',
      alt: 'cover [draft]',
      actor: 'admin',
      ip: '203.0.113.10',
      requestId: 'request-1'
    })

    expect(consume).toHaveBeenCalledWith({ actor: 'admin', ip: '203.0.113.10' })
    expect(consumeBytes).toHaveBeenCalledWith({ actor: 'admin', bytes: expect.any(Number) })
    expect(asset.path).toMatch(/^uploads\/blog\/[a-f0-9]{2}\/[a-f0-9]{64}\.png$/)
    expect(asset).toMatchObject({
      id: asset.sha256,
      mimeType: 'image/png',
      width: 8,
      height: 6,
      provider: 'github',
      locator: { owner: 'owner', repo: 'images', branch: 'main', pathPrefix: 'uploads/blog' },
      available: true,
      created: true,
      markdown: `![cover \\[draft\\]](${asset.url})`
    })
    expect(put).toHaveBeenCalledOnce()
  })

  it('returns processing state with the first stable candidate when propagation is pending', async () => {
    const rateLimiter: MediaRateLimiter = { consume: vi.fn().mockResolvedValue({ remaining: 1, resetAt: '' }) }
    const storage: MediaStorage = {
      provider: 'github',
      put: async input => ({ path: input.path, provider: 'github', created: false, providerObjectId: 'blob' }),
      delete: vi.fn(),
      buildCandidates: path => [{ kind: 'jsdelivr', url: `https://cdn.example.test/${path}` }],
      probe: async () => ({ available: false, checkedAt: '2026-07-13T12:00:00.000Z' })
    }
    const service = new MediaUploadService(config, storage, rateLimiter)

    const asset = await service.upload({
      buffer: await png(),
      declaredMimeType: 'image/png',
      originalName: 'cover.png',
      actor: 'agent',
      ip: '2001:db8::2',
      requestId: 'request-2'
    })

    expect(asset.available).toBe(false)
    expect(asset.url).toBe(asset.candidates[0].url)
    expect(asset.markdown).toBe(`![cover](${asset.url})`)
  })
})
