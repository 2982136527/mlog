import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  autoMerge: true,
  createPullRequest: vi.fn(),
  getBranchHeadSha: vi.fn(),
  mergePullRequest: vi.fn(),
  revalidatePublicContent: vi.fn(),
  triggerVercelDeployHook: vi.fn()
}))

vi.mock('@/lib/admin/env', () => ({
  getAdminGithubEnv: () => ({ autoMerge: mocks.autoMerge })
}))
vi.mock('@/lib/admin/github-client', () => ({
  createPullRequest: mocks.createPullRequest,
  getBranchHeadSha: mocks.getBranchHeadSha,
  mergePullRequest: mocks.mergePullRequest
}))
vi.mock('@/lib/content/revalidation', () => ({
  revalidatePublicContent: mocks.revalidatePublicContent
}))
vi.mock('@/lib/deploy/vercel-hook', () => ({
  triggerVercelDeployHook: mocks.triggerVercelDeployHook
}))

import { createAndMaybeMergePR } from '@/lib/admin/pr-publish'

const target = {
  owner: 'owner',
  repo: 'content',
  baseBranch: 'main',
  token: 'test-token'
}

function publish(changedPaths: string[]) {
  return createAndMaybeMergePR({
    target,
    branch: 'post/test',
    title: 'test',
    body: 'test',
    publishContext: {
      requestId: 'request-id',
      action: 'test',
      changedPaths
    }
  })
}

describe('createAndMaybeMergePR', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.autoMerge = true
    mocks.createPullRequest.mockResolvedValue({ number: 42, html_url: 'https://example.test/pr/42' })
    mocks.getBranchHeadSha.mockResolvedValueOnce('before-merge').mockResolvedValue('merge-sha')
    mocks.mergePullRequest.mockResolvedValue({ merged: true, message: 'merged', sha: 'merge-sha' })
    mocks.revalidatePublicContent.mockReturnValue(true)
    mocks.triggerVercelDeployHook.mockResolvedValue({ triggered: true, success: true, status: 201 })
  })

  it('refreshes runtime content without deploying for article changes', async () => {
    const result = await publish(['content/posts/new-post/zh.md'])

    expect(result).toMatchObject({
      merged: true,
      mergeCommitSha: 'merge-sha',
      branchSynchronized: true,
      cacheInvalidated: true,
      deploymentRequired: false,
      deploy: undefined
    })
    expect(mocks.revalidatePublicContent).toHaveBeenCalledWith(['content/posts/new-post/zh.md'])
    expect(mocks.createPullRequest).toHaveBeenCalledWith(expect.objectContaining({ head: 'post/test', base: 'main' }), target)
    expect(mocks.mergePullRequest).toHaveBeenCalledWith(42, target)
    expect(mocks.triggerVercelDeployHook).not.toHaveBeenCalled()
  })

  it('deploys only for static uploads', async () => {
    mocks.revalidatePublicContent.mockReturnValue(false)
    const result = await publish(['public/images/uploads/2026/07/image.png'])

    expect(result).toMatchObject({
      merged: true,
      branchSynchronized: true,
      cacheInvalidated: false,
      deploymentRequired: true,
      deploy: { triggered: true, success: true }
    })
    expect(mocks.triggerVercelDeployHook).toHaveBeenCalledOnce()
    expect(mocks.triggerVercelDeployHook).toHaveBeenCalledWith({
      requestId: 'request-id',
      reason: 'test',
      changedPaths: ['public/images/uploads/2026/07/image.png']
    })
  })

  it('does not refresh or deploy before a PR is merged', async () => {
    mocks.mergePullRequest.mockResolvedValue({ merged: false, message: 'review required' })
    const result = await publish(['public/images/uploads/2026/07/image.png'])

    expect(result).toMatchObject({
      merged: false,
      deploymentRequired: true,
      deploy: undefined
    })
    expect(mocks.revalidatePublicContent).not.toHaveBeenCalled()
    expect(mocks.triggerVercelDeployHook).not.toHaveBeenCalled()
  })

  it('leaves the PR pending when auto-merge is disabled', async () => {
    mocks.autoMerge = false
    const result = await publish(['content/posts/new-post/zh.md'])

    expect(result).toMatchObject({ merged: false, mergeMessage: 'Auto merge disabled' })
    expect(mocks.getBranchHeadSha).not.toHaveBeenCalled()
    expect(mocks.mergePullRequest).not.toHaveBeenCalled()
    expect(mocks.revalidatePublicContent).not.toHaveBeenCalled()
    expect(mocks.triggerVercelDeployHook).not.toHaveBeenCalled()
  })

  it('refreshes content and deploys once for a mixed article and image change', async () => {
    const changedPaths = [
      'content/posts/new-post/zh.md',
      'public/images/uploads/2026/07/image.png'
    ]
    const result = await publish(changedPaths)

    expect(result).toMatchObject({ cacheInvalidated: true, deploymentRequired: true })
    expect(mocks.revalidatePublicContent).toHaveBeenCalledWith(changedPaths)
    expect(mocks.triggerVercelDeployHook).toHaveBeenCalledOnce()
  })

  it('reports cache invalidation failure without claiming the runtime refresh succeeded', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.revalidatePublicContent.mockImplementation(() => {
      throw new Error('cache unavailable')
    })

    try {
      const result = await publish(['content/posts/new-post/zh.md'])
      expect(result).toMatchObject({
        merged: true,
        branchSynchronized: true,
        cacheInvalidated: false,
        deploymentRequired: false
      })
    } finally {
      warn.mockRestore()
    }
  })

  it('keeps refresh pending when the base branch has not exposed the merge commit', async () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.getBranchHeadSha.mockReset().mockResolvedValue('before-merge')

    try {
      const resultPromise = publish(['content/posts/new-post/zh.md'])
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result).toMatchObject({
        merged: true,
        branchSynchronized: false,
        cacheInvalidated: false,
        deploymentRequired: false
      })
      expect(mocks.revalidatePublicContent).not.toHaveBeenCalled()
      expect(mocks.triggerVercelDeployHook).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
      vi.useRealTimers()
    }
  })
})
