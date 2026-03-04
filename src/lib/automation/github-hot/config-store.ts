import type { GithubHotDailyConfig } from '@/types/automation'
import { getAdminGithubEnv } from '@/lib/admin/env'
import { AdminHttpError } from '@/lib/admin/errors'
import {
  buildBranchName,
  createBranch,
  createPullRequest,
  encodeTextBase64,
  getRepoTextFile,
  mergePullRequest,
  upsertFile
} from '@/lib/admin/github-client'
import { GITHUB_HOT_DAILY_CONFIG_PATH, buildDefaultGithubHotDailyConfig, parseGithubHotDailyConfig, serializeGithubHotDailyConfig } from '@/lib/automation/github-hot/config'

function buildPrBody(input: {
  actor: string
  requestId: string
  path: string
  action: string
}): string {
  return [`管理员：@${input.actor}`, `请求ID：${input.requestId}`, `操作：${input.action}`, '', '变更文件：', `- ${input.path}`].join('\n')
}

async function createAndMaybeMergePR(params: {
  branch: string
  title: string
  body: string
}): Promise<{ branch: string; prNumber: number; prUrl: string; merged: boolean; mergeMessage: string }> {
  const env = getAdminGithubEnv()
  const pr = await createPullRequest({
    title: params.title,
    body: params.body,
    head: params.branch,
    base: env.baseBranch
  })

  let merged = false
  let mergeMessage = 'Auto merge disabled'

  if (env.autoMerge) {
    const mergeResult = await mergePullRequest(pr.number)
    merged = mergeResult.merged
    mergeMessage = mergeResult.message
  }

  return {
    branch: params.branch,
    prNumber: pr.number,
    prUrl: pr.html_url,
    merged,
    mergeMessage
  }
}

export async function loadGithubHotDailyConfig(): Promise<{ config: GithubHotDailyConfig; sha: string | null }> {
  const file = await getRepoTextFile(GITHUB_HOT_DAILY_CONFIG_PATH)
  if (!file) {
    return {
      config: buildDefaultGithubHotDailyConfig('system'),
      sha: null
    }
  }

  try {
    return {
      config: parseGithubHotDailyConfig(JSON.parse(file.content)),
      sha: file.sha
    }
  } catch (error) {
    throw new AdminHttpError(500, 'INVALID_AUTOMATION_CONFIG', error instanceof Error ? error.message : 'Invalid automation config JSON.')
  }
}

export async function saveGithubHotDailyConfig(input: {
  config: GithubHotDailyConfig
  actor: string
  requestId: string
}): Promise<{
  config: GithubHotDailyConfig
  changed: boolean
  publish?: {
    branch: string
    prNumber: number
    prUrl: string
    merged: boolean
    mergeMessage: string
  }
}> {
  const existing = await getRepoTextFile(GITHUB_HOT_DAILY_CONFIG_PATH)
  const serialized = serializeGithubHotDailyConfig(input.config)

  if (existing?.content === serialized) {
    return {
      config: input.config,
      changed: false
    }
  }

  const branch = buildBranchName('automation', 'github-hot-daily')
  await createBranch(branch)

  await upsertFile({
    path: GITHUB_HOT_DAILY_CONFIG_PATH,
    contentBase64: encodeTextBase64(serialized),
    branch,
    message: `update ${GITHUB_HOT_DAILY_CONFIG_PATH}`,
    sha: existing?.sha
  })

  const publish = await createAndMaybeMergePR({
    branch,
    title: '更新自动发布配置：GitHub 爆火日报',
    body: buildPrBody({
      actor: input.actor,
      requestId: input.requestId,
      path: GITHUB_HOT_DAILY_CONFIG_PATH,
      action: 'update-automation-config'
    })
  })

  return {
    config: input.config,
    changed: true,
    publish
  }
}

