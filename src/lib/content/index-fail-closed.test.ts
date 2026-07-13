import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/content/remote-snapshot', () => ({
  getRemoteContentSnapshot: vi.fn().mockRejectedValue(new Error('remote content unavailable'))
}))

import { getAllPostsAsync } from '@/lib/content'

describe('runtime content failure handling', () => {
  it('fails closed instead of exposing the build-time snapshot', async () => {
    await expect(getAllPostsAsync()).rejects.toThrow('remote content unavailable')
  })
})
