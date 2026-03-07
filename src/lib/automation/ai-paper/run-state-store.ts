import { z } from 'zod'
import type { AiPaperDailyLastRunState, AiPaperDailyRunResult } from '@/types/automation'
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

const AI_PAPER_DAILY_LAST_RUN_PATH = 'content/system/automation/ai-paper-daily-last-run.json'

const lastRunSchema = z.object({
  requestId: z.string().trim().min(1),
  actor: z.string().trim().min(1),
  runAt: z.string().trim().min(1),
  result: z.object({
    status: z.enum([
      'PUBLISHED',
      'SKIPPED_DISABLED',
      'SKIPPED_ALREADY_PUBLISHED_TODAY',
      'SKIPPED_ALREADY_HEALTHY',
      'SKIPPED_NO_CANDIDATE',
      'SKIPPED_FETCH_FAILED',
      'SKIPPED_QUALITY_FAILED'
    ]),
    dateStamp: z.string().trim().min(1),
    dateIso: z.string().trim().min(1),
    triggerSource: z.enum(['cron_main', 'cron_backfill', 'admin_manual']).optional(),
    slug: z.string().optional(),
    fixedTags: z.array(z.string()).optional(),
    reason: z.string().optional(),
    changedPaths: z.array(z.string()).optional(),
    selectedPaper: z
      .object({
        arxivId: z.string(),
        title: z.string(),
        paperUrl: z.string(),
        pwcUrl: z.string().optional()
      })
      .optional(),
    quality: z
      .object({
        passed: z.boolean(),
        retryCount: z.number(),
        failedChecks: z.array(z.string())
      })
      .optional(),
    evidence: z
      .object({
        sourceCount: z.number()
      })
      .optional(),
    publish: z
      .object({
        branch: z.string(),
        prNumber: z.number(),
        prUrl: z.string(),
        merged: z.boolean(),
        mergeMessage: z.string().optional(),
        deploy: z
          .object({
            triggered: z.boolean(),
            success: z.boolean(),
            status: z.number().optional(),
            message: z.string().optional()
          })
          .optional()
      })
      .optional(),
    ai: z
      .object({
        triggered: z.boolean(),
        mode: z.enum(['publish', 'draft']),
        steps: z.array(
          z.object({
            task: z.enum(['translate', 'frontmatter_enrich', 'github_hot_post_generate', 'ai_paper_daily_generate']),
            locale: z.enum(['zh', 'en']),
            sourceLocale: z.enum(['zh', 'en']).optional(),
            provider: z.enum(['gemini', 'openai', 'deepseek', 'qwen']),
            model: z.string(),
            attempt: z.number(),
            status: z.enum(['success', 'failed', 'skipped']),
            reason: z.string().optional()
          })
        )
      })
      .optional()
  })
})

function buildPrBody(input: {
  actor: string
  requestId: string
}): string {
  return [`操作者：${input.actor}`, `请求ID：${input.requestId}`, `操作：update-ai-paper-daily-last-run`, '', '变更文件：', `- ${AI_PAPER_DAILY_LAST_RUN_PATH}`].join('\n')
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

function serializeLastRun(state: AiPaperDailyLastRunState): string {
  return `${JSON.stringify(state, null, 2)}\n`
}

export async function loadAiPaperDailyLastRun(): Promise<AiPaperDailyLastRunState | null> {
  const file = await getRepoTextFile(AI_PAPER_DAILY_LAST_RUN_PATH)
  if (!file) {
    return null
  }

  try {
    return lastRunSchema.parse(JSON.parse(file.content)) as AiPaperDailyLastRunState
  } catch (error) {
    throw new AdminHttpError(500, 'INVALID_AUTOMATION_LAST_RUN', error instanceof Error ? error.message : 'Invalid ai-paper daily last run JSON.')
  }
}

export async function saveAiPaperDailyLastRun(input: {
  requestId: string
  actor: string
  result: AiPaperDailyRunResult
}): Promise<void> {
  const state: AiPaperDailyLastRunState = {
    requestId: input.requestId,
    actor: input.actor,
    runAt: new Date().toISOString(),
    result: input.result
  }

  const existing = await getRepoTextFile(AI_PAPER_DAILY_LAST_RUN_PATH)
  const serialized = serializeLastRun(state)
  if (existing?.content === serialized) {
    return
  }

  const branch = buildBranchName('automation', 'ai-paper-daily-last-run')
  await createBranch(branch)

  await upsertFile({
    path: AI_PAPER_DAILY_LAST_RUN_PATH,
    contentBase64: encodeTextBase64(serialized),
    branch,
    message: `update ${AI_PAPER_DAILY_LAST_RUN_PATH}`,
    sha: existing?.sha
  })

  await createAndMaybeMergePR({
    branch,
    title: '更新自动发布最近执行状态：AI 论文速读',
    body: buildPrBody({
      actor: input.actor,
      requestId: input.requestId
    })
  })
}
