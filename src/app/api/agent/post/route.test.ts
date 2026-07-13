import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  publishPostChanges: vi.fn(),
  validateAgentRequest: vi.fn()
}))

vi.mock('@/lib/admin/publish-service', () => ({
  publishPostChanges: mocks.publishPostChanges
}))
vi.mock('@/lib/agent/auth', () => ({
  validateAgentRequest: mocks.validateAgentRequest
}))

import { POST } from '@/app/api/agent/post/route'

const body = {
  slug: 'test-post',
  zh: { title: 'Title', summary: 'Summary', content: 'Body' },
  en: { title: 'Title', summary: 'Summary', content: 'Body' },
  tags: ['test'],
  category: 'Test'
}

function request() {
  return new NextRequest('http://localhost/api/agent/post', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

function publishResult(patch: { branchSynchronized: boolean; cacheInvalidated: boolean }) {
  return {
    changedPaths: ['content/posts/test-post/zh.md', 'content/posts/test-post/en.md'],
    ai: { triggered: false, mode: 'publish', steps: [] },
    result: {
      branch: 'post/test-post',
      prNumber: 1,
      prUrl: 'https://example.test/pr/1',
      merged: true,
      deploymentRequired: false,
      ...patch
    }
  }
}

describe('POST /api/agent/post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.validateAgentRequest.mockResolvedValue('admin')
  })

  it('returns published only after branch visibility and cache invalidation are confirmed', async () => {
    mocks.publishPostChanges.mockResolvedValue(publishResult({ branchSynchronized: true, cacheInvalidated: true }))

    const response = await POST(request())
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({ success: true, status: 'published' })
  })

  it('returns refresh_pending after merge when the runtime refresh is not confirmed', async () => {
    mocks.publishPostChanges.mockResolvedValue(publishResult({ branchSynchronized: false, cacheInvalidated: false }))

    const response = await POST(request())
    const payload = await response.json()

    expect(response.status).toBe(202)
    expect(payload).toMatchObject({ success: false, status: 'refresh_pending' })
  })
})
