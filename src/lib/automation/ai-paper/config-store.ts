import type { AiPaperDailyConfig } from '@/types/automation'
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
import {
  AI_PAPER_DAILY_CONFIG_PATH,
  buildDefaultAiPaperDailyConfig,
  parseAiPaperDailyConfig,
  serializeAiPaperDailyConfig
} from '@/lib/automation/ai-paper/config'

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
}): Promise<{
  branch: string
  prNumber: number
  prUrl: string
  merged: boolean
  mergeMessage: string
}> {
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

export async function loadAiPaperDailyConfig(): Promise<{ config: AiPaperDailyConfig; sha: string | null }> {
  const file = await getRepoTextFile(AI_PAPER_DAILY_CONFIG_PATH)
  if (!file) {
    return {
      config: buildDefaultAiPaperDailyConfig('system'),
      sha: null
    }
  }

  try {
    return {
      config: parseAiPaperDailyConfig(JSON.parse(file.content)),
      sha: file.sha
    }
  } catch (error) {
    throw new AdminHttpError(500, 'INVALID_AUTOMATION_CONFIG', error instanceof Error ? error.message : 'Invalid ai-paper config JSON.')
  }
}

export async function saveAiPaperDailyConfig(input: {
  config: AiPaperDailyConfig
  actor: string
  requestId: string
}): Promise<{
  config: AiPaperDailyConfig
  changed: boolean
  publish?: {
    branch: string
    prNumber: number
    prUrl: string
    merged: boolean
    mergeMessage: string
  }
}> {
  const existing = await getRepoTextFile(AI_PAPER_DAILY_CONFIG_PATH)
  const serialized = serializeAiPaperDailyConfig(input.config)

  if (existing?.content === serialized) {
    return {
      config: input.config,
      changed: false
    }
  }

  const branch = buildBranchName('automation', 'ai-paper-daily')
  await createBranch(branch)

  await upsertFile({
    path: AI_PAPER_DAILY_CONFIG_PATH,
    contentBase64: encodeTextBase64(serialized),
    branch,
    message: `update ${AI_PAPER_DAILY_CONFIG_PATH}`,
    sha: existing?.sha
  })

  const publish = await createAndMaybeMergePR({
    branch,
    title: '更新自动发布配置：AI 论文速读',
    body: buildPrBody({
      actor: input.actor,
      requestId: input.requestId,
      path: AI_PAPER_DAILY_CONFIG_PATH,
      action: 'update-automation-config'
    })
  })

  return {
    config: input.config,
    changed: true,
    publish
  }
}
