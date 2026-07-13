import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  requireAdminSession: vi.fn(),
  reserve: vi.fn(),
  reserveBytes: vi.fn(),
  upload: vi.fn(),
  saveUploadedMedia: vi.fn(),
  listMediaAssets: vi.fn()
}))

vi.mock('@/lib/admin/session', () => ({ requireAdminSession: mocks.requireAdminSession }))
vi.mock('@/lib/media/factory', () => ({ getMediaUploadService: () => ({ reserve: mocks.reserve }) }))
vi.mock('@/lib/media/repository', () => ({
  listMediaAssets: mocks.listMediaAssets,
  saveUploadedMedia: mocks.saveUploadedMedia,
  toMediaDto: (value: { dto: unknown }, duplicate = false) => ({ ...(value.dto as object), duplicate })
}))

import { POST } from '@/app/api/admin/media/route'

const id = 'a'.repeat(64)

function mediaDto(ready: boolean) {
  return {
    id,
    status: ready ? 'ready' : 'processing',
    filename: 'cover.png',
    alt: 'Cover',
    mimeType: 'image/png',
    size: 100,
    width: 10,
    height: 10,
    hash: id,
    url: ready ? 'https://img.example.test/uploads/blog/aa/image.png' : null,
    markdown: ready ? '![Cover](https://img.example.test/uploads/blog/aa/image.png)' : null,
    createdAt: '2026-07-13T00:00:00.000Z',
    deletedAt: null,
    availability: { available: ready, checkedAt: '2026-07-13T00:00:00.000Z' },
    error: null
  }
}

function uploadRequest() {
  const form = new FormData()
  form.set('file', new File([Buffer.from('png')], 'cover.png', { type: 'image/png' }))
  form.set('alt', 'Cover')
  return new NextRequest('http://localhost/api/admin/media', {
    method: 'POST',
    headers: { 'x-forwarded-for': '203.0.113.10' },
    body: form
  })
}

describe('POST /api/admin/media', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdminSession.mockResolvedValue({ login: 'admin' })
    mocks.reserve.mockResolvedValue({ upload: mocks.upload, reserveBytes: mocks.reserveBytes })
  })

  it('returns a verified URL immediately without publish or deploy state', async () => {
    mocks.upload.mockResolvedValue({ id, created: true })
    mocks.saveUploadedMedia.mockResolvedValue({ dto: mediaDto(true) })

    const response = await POST(uploadRequest())
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(payload).toMatchObject({
      success: true,
      status: 'ready',
      available: true,
      url: 'https://img.example.test/uploads/blog/aa/image.png'
    })
    expect(payload).not.toHaveProperty('publish')
    expect(payload).not.toHaveProperty('deploy')
    expect(mocks.reserve).toHaveBeenCalledWith({ actor: 'admin', ip: '203.0.113.10' })
    expect(mocks.reserveBytes).toHaveBeenCalledWith(3)
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({
      alt: 'Cover'
    }))
  })

  it('keeps URL and Markdown null until public availability is confirmed', async () => {
    mocks.upload.mockResolvedValue({ id, created: true })
    mocks.saveUploadedMedia.mockResolvedValue({ dto: mediaDto(false) })

    const response = await POST(uploadRequest())
    const payload = await response.json()

    expect(response.status).toBe(202)
    expect(response.headers.get('retry-after')).toBe('2')
    expect(payload).toMatchObject({
      success: false,
      status: 'processing',
      available: false,
      url: null,
      markdown: null,
      poll: { url: `/api/admin/media/${id}` }
    })
  })

  it('reports a ready hash duplicate as 200', async () => {
    mocks.upload.mockResolvedValue({ id, created: false })
    mocks.saveUploadedMedia.mockResolvedValue({ dto: mediaDto(true) })

    const response = await POST(uploadRequest())
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.media.duplicate).toBe(true)
  })
})
