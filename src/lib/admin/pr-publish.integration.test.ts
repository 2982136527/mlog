import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  triggerVercelDeployHook: vi.fn()
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: mocks.revalidateTag
}))
vi.mock('@/lib/admin/env', () => ({
  getAdminGithubEnv: () => ({ autoMerge: true })
}))
vi.mock('@/lib/admin/github-client', () => ({
  createPullRequest: vi.fn().mockResolvedValue({ number: 7, html_url: 'https://example.test/pr/7' }),
  getBranchHeadSha: vi.fn()
    .mockResolvedValueOnce('before-merge')
    .mockResolvedValue('merge-sha'),
  mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: 'merged', sha: 'merge-sha' })
}))
vi.mock('@/lib/deploy/vercel-hook', () => ({
  triggerVercelDeployHook: mocks.triggerVercelDeployHook
}))

import { PUBLIC_CONTENT_CACHE_TAG } from '@/lib/content/cache'
import { createAndMaybeMergePR } from '@/lib/admin/pr-publish'

describe('published article cache integration', () => {
  it('connects the merged PR to the shared snapshot tag and public routes', async () => {
    const result = await createAndMaybeMergePR({
      target: { owner: 'owner', repo: 'content', baseBranch: 'main', token: 'test-token' },
      branch: 'post/new-post',
      title: 'new post',
      body: 'new post',
      publishContext: {
        requestId: 'request-id',
        action: 'post-create',
        changedPaths: ['content/posts/new-post/zh.md', 'content/posts/new-post/en.md']
      }
    })

    expect(result).toMatchObject({ cacheInvalidated: true, deploymentRequired: false })
    expect(mocks.revalidateTag).toHaveBeenCalledWith(PUBLIC_CONTENT_CACHE_TAG, { expire: 0 })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/zh/blog/new-post')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/en/blog/new-post')
    expect(mocks.triggerVercelDeployHook).not.toHaveBeenCalled()
  })
})
