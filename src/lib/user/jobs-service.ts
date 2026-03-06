import { createHash, randomUUID } from 'node:crypto'
import type { AiRuntimeConfig } from '@/lib/ai/config'
import { runAiUserTopicPostGenerate } from '@/lib/ai/runner'
import { AdminHttpError } from '@/lib/admin/errors'
import { publishPostChanges } from '@/lib/admin/publish-service'
import { getNextRunAt, normalizeCronExpr, normalizeTimezone } from '@/lib/user/cron'
import { ensureUserAutomationSchema, sql } from '@/lib/user/db'
import { getProviderDefaultBaseUrl } from '@/lib/user/provider-catalog'
import { requireActiveUserProfile } from '@/lib/user/profile'
import { getUserAiProviderForRuntime } from '@/lib/user/providers-service'
import type { UserAutomationJob, UserAutomationJobInput, UserAutomationRun, UserAutomationRunStatus } from '@/types/user'

type JobRow = {
  id: string
  user_login: string
  provider_id: string
  topic: string
  cron_expr: string
  timezone: string
  enabled: boolean
  next_run_at: string | null
  last_run_at: string | null
  created_at: string
  updated_at: string
}

type JobExecutionTarget = JobRow & {
  provider: 'gemini' | 'openai' | 'deepseek' | 'qwen'
  model: string
  base_url: string | null
  encrypted_key: string
  iv: string
  auth_tag: string
  key_version: number
}

function sanitizeTagPart(input: string, maxLength = 48): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLength)
}

function normalizeTopic(input: string): string {
  const value = input.trim()
  if (!value) {
    throw new AdminHttpError(400, 'INVALID_INPUT', 'topic is required.')
  }
  return value.slice(0, 200)
}

function toDateStampShanghai(now = new Date()): { dateStamp: string; dateIso: string } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  const parts = formatter.formatToParts(now)
  const year = parts.find(part => part.type === 'year')?.value || '1970'
  const month = parts.find(part => part.type === 'month')?.value || '01'
  const day = parts.find(part => part.type === 'day')?.value || '01'
  return {
    dateStamp: `${year}${month}${day}`,
    dateIso: `${year}-${month}-${day}`
  }
}

function buildUserPostSlug(input: { login: string; topic: string; requestId: string; now?: Date }): string {
  const { dateStamp } = toDateStampShanghai(input.now || new Date())
  const loginKey = sanitizeTagPart(input.login, 20) || 'user'
  const topicKey = sanitizeTagPart(input.topic, 28) || 'topic'
  const digest = createHash('sha1').update(input.requestId).digest('hex').slice(0, 8)
  return `user-ai-${dateStamp}-${loginKey}-${topicKey}-${digest}`
}

function toRunStatusText(status: UserAutomationRunStatus): string {
  if (status === 'PUBLISHED_DRAFT') return 'draft published'
  if (status === 'SKIPPED') return 'skipped'
  return 'failed'
}

function mapJobRow(row: JobRow): UserAutomationJob {
  return {
    id: row.id,
    providerId: row.provider_id,
    topic: row.topic,
    cronExpr: row.cron_expr,
    timezone: row.timezone,
    enabled: row.enabled,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function buildUserRuntimeConfig(input: {
  provider: 'gemini' | 'openai' | 'deepseek' | 'qwen'
  model: string
  baseUrl: string | null
  apiKey: string
}): AiRuntimeConfig {
  const base = {
    enabled: true,
    providerChain: [input.provider],
    timeoutMs: 60_000,
    retryCount: 1,
    gemini: null,
    openai: null,
    deepseek: null,
    qwen: null
  } as AiRuntimeConfig

  if (input.provider === 'gemini') {
    return {
      ...base,
      gemini: {
        apiKey: input.apiKey,
        model: input.model,
        baseUrl: (input.baseUrl || getProviderDefaultBaseUrl('gemini')).replace(/\/+$/, '')
      }
    }
  }

  if (input.provider === 'openai') {
    return {
      ...base,
      openai: {
        apiKey: input.apiKey,
        model: input.model,
        baseUrl: (input.baseUrl || getProviderDefaultBaseUrl('openai')).replace(/\/+$/, '')
      }
    }
  }

  if (input.provider === 'deepseek') {
    return {
      ...base,
      deepseek: {
        apiKey: input.apiKey,
        model: input.model,
        baseUrl: (input.baseUrl || getProviderDefaultBaseUrl('deepseek')).replace(/\/+$/, '')
      }
    }
  }

  return {
    ...base,
    qwen: {
      apiKey: input.apiKey,
      model: input.model,
      baseUrl: (input.baseUrl || getProviderDefaultBaseUrl('qwen')).replace(/\/+$/, '')
    }
  }
}

export async function listUserAutomationJobs(login: string): Promise<UserAutomationJob[]> {
  await requireActiveUserProfile(login)
  const result = await sql<JobRow>`
    SELECT id, user_login, provider_id, topic, cron_expr, timezone, enabled,
           next_run_at::text, last_run_at::text, created_at::text, updated_at::text
    FROM user_automation_jobs
    WHERE user_login = ${login}
    ORDER BY created_at DESC
  `
  return result.rows.map(mapJobRow)
}

export async function createUserAutomationJob(login: string, input: UserAutomationJobInput): Promise<UserAutomationJob> {
  await requireActiveUserProfile(login)
  const provider = await getUserAiProviderForRuntime(login, input.providerId)
  if (!provider) {
    throw new AdminHttpError(404, 'NOT_FOUND', 'Provider not found.')
  }

  const topic = normalizeTopic(input.topic)
  const cronExpr = normalizeCronExpr(input.cronExpr)
  const timezone = normalizeTimezone(input.timezone)
  const enabled = input.enabled !== false
  const nextRunAt = enabled ? getNextRunAt({ cronExpr, timezone }) : null
  const id = randomUUID()

  await sql`
    INSERT INTO user_automation_jobs (
      id, user_login, provider_id, topic, cron_expr, timezone, enabled, next_run_at
    ) VALUES (
      ${id}, ${login}, ${input.providerId}, ${topic}, ${cronExpr}, ${timezone}, ${enabled}, ${nextRunAt}
    )
  `

  const created = await getUserAutomationJobById(login, id)
  if (!created) {
    throw new AdminHttpError(500, 'INTERNAL_ERROR', 'Failed to load created job.')
  }
  return created
}

export async function updateUserAutomationJob(
  login: string,
  id: string,
  input: Partial<UserAutomationJobInput> & { enabled?: boolean }
): Promise<UserAutomationJob> {
  await requireActiveUserProfile(login)
  const existing = await getUserAutomationJobRaw(login, id)
  if (!existing) {
    throw new AdminHttpError(404, 'NOT_FOUND', 'Automation job not found.')
  }

  const providerId = input.providerId || existing.provider_id
  await getUserAiProviderForRuntime(login, providerId)
  const topic = input.topic ? normalizeTopic(input.topic) : existing.topic
  const cronExpr = input.cronExpr ? normalizeCronExpr(input.cronExpr) : existing.cron_expr
  const timezone = input.timezone ? normalizeTimezone(input.timezone) : existing.timezone
  const enabled = input.enabled === undefined ? existing.enabled : Boolean(input.enabled)
  const nextRunAt = enabled ? getNextRunAt({ cronExpr, timezone }) : null

  await sql`
    UPDATE user_automation_jobs
    SET provider_id = ${providerId},
        topic = ${topic},
        cron_expr = ${cronExpr},
        timezone = ${timezone},
        enabled = ${enabled},
        next_run_at = ${nextRunAt},
        lock_expires_at = NULL,
        updated_at = NOW()
    WHERE id = ${id} AND user_login = ${login}
  `

  const updated = await getUserAutomationJobById(login, id)
  if (!updated) {
    throw new AdminHttpError(500, 'INTERNAL_ERROR', 'Failed to load updated job.')
  }
  return updated
}

export async function deleteUserAutomationJob(login: string, id: string): Promise<void> {
  await requireActiveUserProfile(login)
  const result = await sql`
    DELETE FROM user_automation_jobs
    WHERE id = ${id} AND user_login = ${login}
  `
  if (result.rowCount === 0) {
    throw new AdminHttpError(404, 'NOT_FOUND', 'Automation job not found.')
  }
}

async function getUserAutomationJobRaw(login: string, id: string): Promise<JobRow | null> {
  const result = await sql<JobRow>`
    SELECT id, user_login, provider_id, topic, cron_expr, timezone, enabled,
           next_run_at::text, last_run_at::text, created_at::text, updated_at::text
    FROM user_automation_jobs
    WHERE id = ${id} AND user_login = ${login}
    LIMIT 1
  `
  return result.rows[0] || null
}

export async function getUserAutomationJobById(login: string, id: string): Promise<UserAutomationJob | null> {
  await requireActiveUserProfile(login)
  const row = await getUserAutomationJobRaw(login, id)
  return row ? mapJobRow(row) : null
}

async function getJobExecutionTarget(login: string, id: string): Promise<JobExecutionTarget> {
  const result = await sql<JobExecutionTarget>`
    SELECT j.id, j.user_login, j.provider_id, j.topic, j.cron_expr, j.timezone, j.enabled,
           j.next_run_at::text, j.last_run_at::text, j.created_at::text, j.updated_at::text,
           p.provider, p.model, p.base_url, p.encrypted_key, p.iv, p.auth_tag, p.key_version
    FROM user_automation_jobs j
    JOIN user_ai_providers p ON p.id = j.provider_id
    JOIN user_profiles u ON u.login = j.user_login
    WHERE j.id = ${id}
      AND j.user_login = ${login}
      AND p.user_login = ${login}
      AND p.enabled = TRUE
      AND u.status = 'active'
    LIMIT 1
  `
  const row = result.rows[0]
  if (!row) {
    throw new AdminHttpError(404, 'NOT_FOUND', 'Automation job not found or provider disabled.')
  }
  return row
}

async function persistRunRecord(input: {
  id: string
  jobId: string
  userLogin: string
  status: UserAutomationRunStatus
  requestId: string
  slug: string | null
  provider: string
  model: string
  message: string | null
  errorCode: string | null
  errorMessage: string | null
  publishPrUrl: string | null
  publishMerged: boolean | null
  startedAt: string
  finishedAt: string
}) {
  await sql`
    INSERT INTO user_automation_runs (
      id, job_id, user_login, status, request_id, slug, provider, model,
      message, error_code, error_message, publish_pr_url, publish_merged, started_at, finished_at
    ) VALUES (
      ${input.id}, ${input.jobId}, ${input.userLogin}, ${input.status}, ${input.requestId}, ${input.slug},
      ${input.provider}, ${input.model}, ${input.message}, ${input.errorCode}, ${input.errorMessage},
      ${input.publishPrUrl}, ${input.publishMerged}, ${input.startedAt}, ${input.finishedAt}
    )
  `
}

async function updateJobAfterRun(input: { job: JobExecutionTarget; nextRunAt: string | null }) {
  await sql`
    UPDATE user_automation_jobs
    SET last_run_at = NOW(),
        next_run_at = ${input.nextRunAt},
        lock_expires_at = NULL,
        updated_at = NOW()
    WHERE id = ${input.job.id}
  `
}

export async function listUserAutomationRuns(login: string, jobId?: string): Promise<UserAutomationRun[]> {
  await requireActiveUserProfile(login)
  const result = jobId
    ? await sql<{
        id: string
        job_id: string
        status: UserAutomationRunStatus
        request_id: string
        slug: string | null
        provider: string
        model: string
        message: string | null
        error_code: string | null
        error_message: string | null
        publish_pr_url: string | null
        publish_merged: boolean | null
        started_at: string
        finished_at: string | null
      }>`
        SELECT id, job_id, status, request_id, slug, provider, model, message, error_code, error_message,
               publish_pr_url, publish_merged, started_at::text, finished_at::text
        FROM user_automation_runs
        WHERE user_login = ${login} AND job_id = ${jobId}
        ORDER BY started_at DESC
        LIMIT 50
      `
    : await sql<{
        id: string
        job_id: string
        status: UserAutomationRunStatus
        request_id: string
        slug: string | null
        provider: string
        model: string
        message: string | null
        error_code: string | null
        error_message: string | null
        publish_pr_url: string | null
        publish_merged: boolean | null
        started_at: string
        finished_at: string | null
      }>`
        SELECT id, job_id, status, request_id, slug, provider, model, message, error_code, error_message,
               publish_pr_url, publish_merged, started_at::text, finished_at::text
        FROM user_automation_runs
        WHERE user_login = ${login}
        ORDER BY started_at DESC
        LIMIT 50
      `

  return result.rows.map(row => ({
    id: row.id,
    jobId: row.job_id,
    status: row.status,
    requestId: row.request_id,
    slug: row.slug,
    provider: row.provider,
    model: row.model,
    message: row.message,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    publishPrUrl: row.publish_pr_url,
    publishMerged: row.publish_merged,
    startedAt: row.started_at,
    finishedAt: row.finished_at
  }))
}

async function executeUserAutomationJob(input: {
  job: JobExecutionTarget
  requestId: string
  actor: string
}): Promise<{ status: UserAutomationRunStatus; slug: string | null; message: string | null; errorCode: string | null; errorMessage: string | null; publishPrUrl: string | null; publishMerged: boolean | null }> {
  const provider = await getUserAiProviderForRuntime(input.job.user_login, input.job.provider_id)
  const runtimeConfig = buildUserRuntimeConfig({
    provider: provider.provider,
    model: provider.model,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey
  })

  const now = new Date()
  const { dateIso } = toDateStampShanghai(now)
  const generated = await runAiUserTopicPostGenerate({
    locale: 'zh',
    dateIso,
    topic: input.job.topic,
    runtimeConfig
  })

  const slug = buildUserPostSlug({
    login: input.job.user_login,
    topic: input.job.topic,
    requestId: input.requestId,
    now
  })

  const modelTag = `model-${sanitizeTagPart(provider.model)}`
  const forcedTags = ['ai-user', `author-${sanitizeTagPart(input.job.user_login)}`, `provider-${provider.provider}`, modelTag]

  const published = await publishPostChanges({
    slug,
    mode: 'draft',
    actor: input.actor,
    requestId: input.requestId,
    forcedTags,
    changes: [
      {
        locale: 'zh',
        frontmatter: {
          title: generated.payload.title,
          date: dateIso,
          summary: generated.payload.summary,
          tags: generated.payload.tags,
          category: generated.payload.category,
          draft: true,
          updated: dateIso
        },
        markdown: generated.payload.markdown
      }
    ]
  })

  const status: UserAutomationRunStatus = 'PUBLISHED_DRAFT'
  return {
    status,
    slug,
    message: toRunStatusText(status),
    errorCode: null,
    errorMessage: null,
    publishPrUrl: published.result.prUrl,
    publishMerged: published.result.merged
  }
}

export async function runUserAutomationJobNow(login: string, jobId: string, requestId: string): Promise<UserAutomationRun> {
  await requireActiveUserProfile(login)
  const job = await getJobExecutionTarget(login, jobId)
  const runId = randomUUID()
  const startedAt = new Date().toISOString()
  let status: UserAutomationRunStatus = 'FAILED'
  let slug: string | null = null
  let message: string | null = null
  let errorCode: string | null = null
  let errorMessage: string | null = null
  let publishPrUrl: string | null = null
  let publishMerged: boolean | null = null

  try {
    const result = await executeUserAutomationJob({
      job,
      requestId,
      actor: `user:${login}`
    })
    status = result.status
    slug = result.slug
    message = result.message
    errorCode = result.errorCode
    errorMessage = result.errorMessage
    publishPrUrl = result.publishPrUrl
    publishMerged = result.publishMerged
  } catch (error) {
    status = 'FAILED'
    errorCode = error instanceof AdminHttpError ? error.code : 'INTERNAL_ERROR'
    errorMessage = error instanceof Error ? error.message : 'Failed to run user automation job.'
    message = toRunStatusText(status)
  }

  const finishedAt = new Date().toISOString()
  const nextRunAt = job.enabled ? getNextRunAt({ cronExpr: job.cron_expr, timezone: job.timezone, from: new Date() }) : null
  await persistRunRecord({
    id: runId,
    jobId: job.id,
    userLogin: job.user_login,
    status,
    requestId,
    slug,
    provider: job.provider,
    model: job.model,
    message,
    errorCode,
    errorMessage,
    publishPrUrl,
    publishMerged,
    startedAt,
    finishedAt
  })
  await updateJobAfterRun({
    job,
    nextRunAt
  })

  return {
    id: runId,
    jobId: job.id,
    status,
    requestId,
    slug,
    provider: job.provider,
    model: job.model,
    message,
    errorCode,
    errorMessage,
    publishPrUrl,
    publishMerged,
    startedAt,
    finishedAt
  }
}

async function claimDueJobs(limit: number): Promise<JobExecutionTarget[]> {
  const candidates = await sql<JobExecutionTarget>`
    SELECT j.id, j.user_login, j.provider_id, j.topic, j.cron_expr, j.timezone, j.enabled,
           j.next_run_at::text, j.last_run_at::text, j.created_at::text, j.updated_at::text,
           p.provider, p.model, p.base_url, p.encrypted_key, p.iv, p.auth_tag, p.key_version
    FROM user_automation_jobs j
    JOIN user_ai_providers p ON p.id = j.provider_id
    JOIN user_profiles u ON u.login = j.user_login
    WHERE j.enabled = TRUE
      AND p.enabled = TRUE
      AND u.status = 'active'
      AND j.next_run_at IS NOT NULL
      AND j.next_run_at <= NOW()
      AND (j.lock_expires_at IS NULL OR j.lock_expires_at < NOW())
    ORDER BY j.next_run_at ASC
    LIMIT ${Math.max(1, Math.min(limit, 50))}
  `

  const claimed: JobExecutionTarget[] = []
  for (const row of candidates.rows) {
    const lock = await sql`
      UPDATE user_automation_jobs
      SET lock_expires_at = NOW() + INTERVAL '4 minutes',
          updated_at = NOW()
      WHERE id = ${row.id}
        AND (lock_expires_at IS NULL OR lock_expires_at < NOW())
      RETURNING id
    `
    if ((lock.rowCount || 0) > 0) {
      claimed.push(row)
    }
  }
  return claimed
}

export async function dispatchDueUserAutomationJobs(input: { requestId: string; limit?: number }): Promise<{
  scanned: number
  executed: number
  success: number
  failed: number
  runIds: string[]
}> {
  await ensureUserAutomationSchema()
  const claimed = await claimDueJobs(input.limit || 20)
  const runIds: string[] = []
  let success = 0
  let failed = 0

  for (const job of claimed) {
    const run = await runUserAutomationJobNow(job.user_login, job.id, `${input.requestId}:${job.id}`)
    runIds.push(run.id)
    if (run.status === 'PUBLISHED_DRAFT') {
      success += 1
    } else {
      failed += 1
    }
  }

  return {
    scanned: claimed.length,
    executed: claimed.length,
    success,
    failed,
    runIds
  }
}
