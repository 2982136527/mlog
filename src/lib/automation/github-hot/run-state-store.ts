import { z } from 'zod'
import type { GithubHotDailyLastRunState, GithubHotDailyRunResult } from '@/types/automation'
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

const GITHUB_HOT_DAILY_LAST_RUN_PATH = 'content/system/automation/github-hot-daily-last-run.json'

const lastRunSchema = z.object({
  requestId: z.string().trim().min(1),
  actor: z.string().trim().min(1),
  runAt: z.string().trim().min(1),
  result: z.object({
    status: z.enum(['PUBLISHED', 'SKIPPED_DISABLED', 'SKIPPED_ALREADY_PUBLISHED_TODAY', 'SKIPPED_NO_CANDIDATE', 'SKIPPED_FETCH_FAILED']),
    dateStamp: z.string().trim().min(1),
    dateIso: z.string().trim().min(1),
    usedTopicFallback: z.boolean(),
    selectionMode: z.enum(['scored_keyword', 'theme_random_seeded']),
    presetKeywords: z.array(z.string()),
    overlayKeywords: z.array(z.string()),
    effectiveKeywords: z.array(z.string()),
    randomSeedDate: z.string().nullable(),
    fixedTags: z.array(z.string()).optional(),
    quality: z
      .object({
        passed: z.boolean(),
        retryCount: z.number(),
        failedChecks: z.array(z.string())
      })
      .optional(),
    evidence: z
      .object({
        sourceCount: z.number(),
        readmeHighlightsCount: z.number()
      })
      .optional(),
    reason: z.string().optional(),
    slug: z.string().optional(),
    changedPaths: z.array(z.string()).optional(),
    selectedRepo: z
      .object({
        rank: z.number(),
        owner: z.string(),
        repo: z.string(),
        fullName: z.string(),
        url: z.string(),
        description: z.string(),
        language: z.string(),
        topics: z.array(z.string()),
        stars: z.number(),
        forks: z.number(),
        updatedAt: z.string()
      })
      .optional(),
    selectedScore: z
      .object({
        fullName: z.string(),
        rank: z.number(),
        stars: z.number(),
        language: z.string(),
        matchedKeywords: z.array(z.string()),
        hitExcludeKeywords: z.array(z.string()),
        score: z.number(),
        reason: z.array(z.string())
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
            task: z.enum(['translate', 'frontmatter_enrich', 'github_hot_post_generate']),
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
  return [`操作者：${input.actor}`, `请求ID：${input.requestId}`, `操作：update-github-hot-daily-last-run`, '', '变更文件：', `- ${GITHUB_HOT_DAILY_LAST_RUN_PATH}`].join('\n')
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

function serializeLastRun(state: GithubHotDailyLastRunState): string {
  return `${JSON.stringify(state, null, 2)}\n`
}

export async function loadGithubHotDailyLastRun(): Promise<GithubHotDailyLastRunState | null> {
  const file = await getRepoTextFile(GITHUB_HOT_DAILY_LAST_RUN_PATH)
  if (!file) {
    return null
  }

  try {
    return lastRunSchema.parse(JSON.parse(file.content)) as GithubHotDailyLastRunState
  } catch (error) {
    throw new AdminHttpError(500, 'INVALID_AUTOMATION_LAST_RUN', error instanceof Error ? error.message : 'Invalid github hot daily last run JSON.')
  }
}

export async function saveGithubHotDailyLastRun(input: {
  requestId: string
  actor: string
  result: GithubHotDailyRunResult
}): Promise<void> {
  const state: GithubHotDailyLastRunState = {
    requestId: input.requestId,
    actor: input.actor,
    runAt: new Date().toISOString(),
    result: input.result
  }

  const existing = await getRepoTextFile(GITHUB_HOT_DAILY_LAST_RUN_PATH)
  const serialized = serializeLastRun(state)

  if (existing?.content === serialized) {
    return
  }

  const branch = buildBranchName('automation', 'github-hot-daily-last-run')
  await createBranch(branch)

  await upsertFile({
    path: GITHUB_HOT_DAILY_LAST_RUN_PATH,
    contentBase64: encodeTextBase64(serialized),
    branch,
    message: `update ${GITHUB_HOT_DAILY_LAST_RUN_PATH}`,
    sha: existing?.sha
  })

  await createAndMaybeMergePR({
    branch,
    title: '更新自动发布最近执行状态：GitHub 爆火日报',
    body: buildPrBody({
      actor: input.actor,
      requestId: input.requestId
    })
  })
}
