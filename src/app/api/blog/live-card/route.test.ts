import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getLiveCardForPost: vi.fn()
}))

vi.mock('@/lib/blog/live-card', () => ({
  getLiveCardForPost: mocks.getLiveCardForPost,
  LiveCardHttpError: class LiveCardHttpError extends Error {}
}))

import { GET } from '@/app/api/blog/live-card/route'

describe('GET /api/blog/live-card', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getLiveCardForPost.mockResolvedValue({ enabled: true })
  })

  it('does not CDN-cache post visibility or repo-card configuration', async () => {
    const response = await GET(new NextRequest('http://localhost/api/blog/live-card?locale=zh&slug=test-post'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
})
