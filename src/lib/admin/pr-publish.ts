import 'server-only'
import type { PublishResult } from '@/types/admin'
import { getAdminGithubEnv } from '@/lib/admin/env'
import {
  createPullRequest,
  getBranchHeadSha,
  mergePullRequest,
  type GithubRepoTarget
} from '@/lib/admin/github-client'
import { revalidatePublicContent } from '@/lib/content/revalidation'
import { requiresVercelDeployment } from '@/lib/deploy/policy'
import { triggerVercelDeployHook } from '@/lib/deploy/vercel-hook'

const BRANCH_SYNC_DELAYS_MS = [0, 100, 250, 500, 1_000]

async function waitForMergedCommit(input: {
  target: GithubRepoTarget
  previousHead?: string
  mergeCommitSha?: string
}): Promise<boolean> {
  for (const delayMs of BRANCH_SYNC_DELAYS_MS) {
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }

    try {
      const currentHead = await getBranchHeadSha(input.target.baseBranch, input.target)
      if (input.mergeCommitSha && currentHead === input.mergeCommitSha) {
        return true
      }
      if (input.previousHead && currentHead !== input.previousHead) {
        return true
      }
    } catch {
      // Retry within the short propagation window.
    }
  }

  return false
}

export async function createAndMaybeMergePR(params: {
  target: GithubRepoTarget
  branch: string
  title: string
  body: string
  publishContext: {
    requestId: string
    action: string
    changedPaths: string[]
  }
}): Promise<PublishResult> {
  const { autoMerge } = getAdminGithubEnv()
  const pr = await createPullRequest({
    title: params.title,
    body: params.body,
    head: params.branch,
    base: params.target.baseBranch
  }, params.target)

  let merged = false
  let mergeMessage = 'Auto merge disabled'
  let mergeCommitSha: string | undefined
  let previousHead: string | undefined

  if (autoMerge) {
    previousHead = await getBranchHeadSha(params.target.baseBranch, params.target).catch(() => undefined)
    const mergeResult = await mergePullRequest(pr.number, params.target)
    merged = mergeResult.merged
    mergeMessage = mergeResult.message
    mergeCommitSha = mergeResult.sha || undefined
  }

  let deploy: PublishResult['deploy']
  let cacheInvalidated = false
  const deploymentRequired = requiresVercelDeployment(params.publishContext.changedPaths)
  let branchSynchronized: boolean | undefined

  if (merged) {
    branchSynchronized = await waitForMergedCommit({
      target: params.target,
      previousHead,
      mergeCommitSha
    })

    if (!branchSynchronized) {
      console.warn('[content][branch-sync-pending]', {
        requestId: params.publishContext.requestId,
        action: params.publishContext.action
      })
    } else {
      try {
        cacheInvalidated = revalidatePublicContent(params.publishContext.changedPaths)
      } catch (error) {
        console.warn('[content][revalidate]', {
          requestId: params.publishContext.requestId,
          error: error instanceof Error ? error.message : error
        })
      }

      if (deploymentRequired) {
        deploy = await triggerVercelDeployHook({
          requestId: params.publishContext.requestId,
          reason: params.publishContext.action,
          changedPaths: params.publishContext.changedPaths
        })
      }
    }
  }

  return {
    branch: params.branch,
    prNumber: pr.number,
    prUrl: pr.html_url,
    merged,
    mergeMessage,
    mergeCommitSha,
    branchSynchronized,
    cacheInvalidated,
    deploymentRequired,
    deploy
  }
}
