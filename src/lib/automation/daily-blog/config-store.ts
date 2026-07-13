import type { DailyBlogConfig, DailyBlogConfigUpdate } from '@/types/automation'
import { AdminHttpError } from '@/lib/admin/errors'
import { getAdminGithubEnv } from '@/lib/admin/env'
import {
  buildBranchName,
  createBranch,
  createPullRequest,
  encodeTextBase64,
  getRepoTextFile,
  mergePullRequest,
  upsertFile
} from '@/lib/admin/github-client'
import {
  DAILY_BLOG_CONFIG_PATH,
  buildDefaultDailyBlogConfig,
  parseDailyBlogConfig,
  parseDailyBlogConfigUpdate,
  serializeDailyBlogConfig
} from '@/lib/automation/daily-blog/config'

function buildPrBody(input: {
  actor: string
  requestId: string
  path: string
  action: string
}): string {
  return [
    `管理员：${input.actor}`,
    `请求ID：${input.requestId}`,
    `操作：${input.action}`,
    '',
    '变更文件：',
    `- ${input.path}`
  ].join('\n')
}

async function createAndMaybeMergePR(params: {
  branch: string
  title: string
  body: string
}): Promise<{ prNumber: number; prUrl: string; merged: boolean; mergeMessage: string }> {
  const env = getAdminGithubEnv()
  const pr = await createPullRequest({
    head: params.branch,
    base: env.baseBranch,
    title: params.title,
    body: params.body
  }, env)

  if (!env.autoMerge) {
    return {
      prNumber: pr.number,
      prUrl: pr.html_url,
      merged: false,
      mergeMessage: 'auto-merge disabled'
    }
  }

  const merge = await mergePullRequest(pr.number, env)
  return {
    prNumber: pr.number,
    prUrl: pr.html_url,
    merged: merge.merged,
    mergeMessage: merge.message
  }
}

export async function loadDailyBlogConfig(): Promise<{ config: DailyBlogConfig; rawSha: string | null }> {
  const env = getAdminGithubEnv()
  const existing = await getRepoTextFile(DAILY_BLOG_CONFIG_PATH, env.baseBranch, env)

  if (existing) {
    try {
      const config = parseDailyBlogConfig(JSON.parse(existing.content))
      return { config, rawSha: existing.sha }
    } catch (error) {
      throw new AdminHttpError(
        500,
        'INVALID_AUTOMATION_CONFIG',
        error instanceof Error ? error.message : 'Invalid daily-blog config JSON.'
      )
    }
  }

  return { config: buildDefaultDailyBlogConfig('system'), rawSha: null }
}

export async function updateDailyBlogConfig(
  update: DailyBlogConfigUpdate,
  actor: string,
  requestId: string
): Promise<{
  config: DailyBlogConfig
  rawSha: string
  publish: { prNumber: number; prUrl: string; merged: boolean; mergeMessage: string }
}> {
  const env = getAdminGithubEnv()
  const { config: current, rawSha: currentSha } = await loadDailyBlogConfig()

  const parsed = parseDailyBlogConfigUpdate(update, current)
  const newConfig: DailyBlogConfig = {
    ...current,
    ...parsed,
    updatedAt: new Date().toISOString(),
    updatedBy: actor === 'system' ? 'system' : 'admin'
  }

  const content = serializeDailyBlogConfig(newConfig)
  const branch = buildBranchName('automation', 'daily-blog-config-update')
  await createBranch(branch, env)

  const result = await upsertFile({
    path: DAILY_BLOG_CONFIG_PATH,
    contentBase64: encodeTextBase64(content),
    message: `Update daily-blog config (${requestId})`,
    branch,
    sha: currentSha || undefined
  }, env)

  const prBody = buildPrBody({
    actor,
    requestId,
    path: DAILY_BLOG_CONFIG_PATH,
    action: 'update daily-blog config'
  })

  const publish = await createAndMaybeMergePR({
    branch,
    title: 'Update daily-blog automation config',
    body: prBody
  })

  return { config: newConfig, rawSha: result.sha, publish }
}
