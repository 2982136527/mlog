import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { AgentAuthError } from '@/lib/agent/auth'

const mocks = vi.hoisted(() => ({
  validateAgentRequest: vi.fn(),
  reserve: vi.fn(),
  reserveBytes: vi.fn(),
  upload: vi.fn(),
  saveUploadedMedia: vi.fn()
}))

vi.mock('@/lib/agent/auth', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/agent/auth')>()
  return { ...original, validateAgentRequest: mocks.validateAgentRequest }
})
vi.mock('@/lib/media/factory', () => ({ getMediaUploadService: () => ({ reserve: mocks.reserve }) }))
vi.mock('@/lib/media/repository', () => ({
  saveUploadedMedia: mocks.saveUploadedMedia,
  toMediaDto: (value: { dto: unknown }, duplicate = false) => ({ ...(value.dto as object), duplicate })
}))

import { POST } from '@/app/api/agent/upload/route'

const id = 'b'.repeat(64)

function request(withFile = true) {
  const form = new FormData()
  if (withFile) form.set('file', new File([Buffer.from('png')], 'agent.png', { type: 'image/png' }))
  return new NextRequest('http://localhost/api/agent/upload', {
    method: 'POST',
    headers: { Authorization: 'Bearer test', 'x-forwarded-for': '203.0.113.11' },
    body: form
  })
}

function dto() {
  return {
    id,
    status: 'processing',
    filename: 'agent.png',
    alt: 'agent',
    mimeType: 'image/png',
    size: 100,
    width: 10,
    height: 10,
    hash: id,
    url: null,
    markdown: null,
    createdAt: '2026-07-13T00:00:00.000Z',
    deletedAt: null,
    availability: { available: false, checkedAt: '2026-07-13T00:00:00.000Z' },
    error: null
  }
}

describe('POST /api/agent/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.validateAgentRequest.mockResolvedValue('admin')
    mocks.reserve.mockResolvedValue({ upload: mocks.upload, reserveBytes: mocks.reserveBytes })
    mocks.upload.mockResolvedValue({ id, created: true })
    mocks.saveUploadedMedia.mockResolvedValue({ dto: dto() })
  })

  it('returns a pollable processing resource and no premature URL', async () => {
    const response = await POST(request())
    const payload = await response.json()

    expect(response.status).toBe(202)
    expect(payload).toMatchObject({
      accepted: true,
      success: false,
      available: false,
      url: null,
      markdown: null,
      poll: { url: `/api/agent/media/${id}` }
    })
    expect(payload).not.toHaveProperty('publish')
  })

  it('rejects unauthenticated requests before reading or uploading the file', async () => {
    mocks.validateAgentRequest.mockRejectedValue(new AgentAuthError())

    const response = await POST(request())
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload.error.code).toBe('AGENT_AUTH_FAILED')
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('rejects a missing file as a stable client error', async () => {
    const response = await POST(request(false))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error.code).toBe('MEDIA_INVALID_INPUT')
    expect(mocks.upload).not.toHaveBeenCalled()
  })
})
