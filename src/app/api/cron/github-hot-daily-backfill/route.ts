import { NextRequest } from 'next/server'
import type { GithubHotDailyConfig, GithubHotDailyRunResult } from '@/types/automation'
import { AdminHttpError } from '@/lib/admin/errors'
import { listContentMarkdownPaths } from '@/lib/admin/github-client'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { buildAutomationHealth, getShanghaiDateContext, hasPublishedTodayByPrefix } from '@/lib/automation/daily-health'
import { BACKFILL_SCHEDULE_HOUR, DAILY_SCHEDULE_HOUR, GITHUB_HOT_DAILY_SLUG_PREFIX, INTEREST_PRESET_KEYWORDS } from '@/lib/automation/github-hot/config'
import { loadGithubHotDailyConfig } from '@/lib/automation/github-hot/config-store'
import { saveGithubHotDailyLastRun } from '@/lib/automation/github-hot/run-state-store'
import { runGithubHotDailyAutomation } from '@/lib/automation/github-hot/service'

export const runtime = 'nodejs'
export const maxDuration = 300

const FIXED_TAGS = ['ai-auto', 'github-hot'] as const

function requireCronAuth(request: NextRequest) {
  const expected = (process.env.CRON_SECRET || '').trim()
  if (!expected) {
    throw new AdminHttpError(500, 'CRON_SECRET_MISSING', 'CRON_SECRET is not configured.')
  }

  const authHeader = request.headers.get('authorization') || ''
  const expectedHeader = `Bearer ${expected}`
  if (authHeader !== expectedHeader) {
    throw new AdminHttpError(401, 'UNAUTHORIZED', 'Invalid cron authorization header.')
  }
}

function normalizeKeywords(items: string[]): string[] {
  return Array.from(
    new Set(
      items
        .map(item => item.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 40)
    )
  )
}

function buildSkippedResult(input: {
  config: GithubHotDailyConfig
  dateStamp: string
  dateIso: string
  status: 'SKIPPED_DISABLED' | 'SKIPPED_ALREADY_HEALTHY'
  reason: string
}): GithubHotDailyRunResult {
  const presetKeywords = normalizeKeywords(INTEREST_PRESET_KEYWORDS[input.config.interestPreset] || [])
  const overlayKeywords = normalizeKeywords(input.config.topicKeywords)
  const selectionMode = overlayKeywords.length > 0 ? 'scored_keyword' : 'theme_random_seeded'
  const effectiveKeywords = selectionMode === 'scored_keyword' ? normalizeKeywords([...presetKeywords, ...overlayKeywords]) : presetKeywords

  return {
    status: input.status,
    dateStamp: input.dateStamp,
    dateIso: input.dateIso,
    triggerSource: 'cron_backfill',
    usedTopicFallback: false,
    selectionMode,
    presetKeywords,
    overlayKeywords,
    effectiveKeywords,
    randomSeedDate: selectionMode === 'theme_random_seeded' ? input.dateStamp : null,
    fixedTags: [...FIXED_TAGS],
    reason: input.reason
  }
}

export async function GET(request: NextRequest) {
  const requestId = createRequestId()

  try {
    requireCronAuth(request)

    const [loaded, paths] = await Promise.all([loadGithubHotDailyConfig(), listContentMarkdownPaths()])
    const today = getShanghaiDateContext()
    const hasPublishedToday = hasPublishedTodayByPrefix(paths, GITHUB_HOT_DAILY_SLUG_PREFIX, today.dateStamp)
    const health = buildAutomationHealth({
      enabled: loaded.config.enabled,
      dateStamp: today.dateStamp,
      dateIso: today.dateIso,
      minutesOfDay: today.minutesOfDay,
      expectedHour: DAILY_SCHEDULE_HOUR,
      backfillHour: BACKFILL_SCHEDULE_HOUR,
      hasPublishedToday
    })

    let result: GithubHotDailyRunResult
    if (health.state === 'missed') {
      result = await runGithubHotDailyAutomation({
        actor: 'system:cron-backfill',
        requestId,
        triggerSource: 'cron_backfill'
      })
    } else if (health.state === 'disabled') {
      result = buildSkippedResult({
        config: loaded.config,
        dateStamp: today.dateStamp,
        dateIso: today.dateIso,
        status: 'SKIPPED_DISABLED',
        reason: 'automation disabled'
      })
    } else {
      result = buildSkippedResult({
        config: loaded.config,
        dateStamp: today.dateStamp,
        dateIso: today.dateIso,
        status: 'SKIPPED_ALREADY_HEALTHY',
        reason: `health=${health.state}, hasPublishedToday=${health.hasPublishedToday}`
      })
    }

    try {
      await saveGithubHotDailyLastRun({
        requestId,
        actor: 'system:cron-backfill',
        result
      })
    } catch (saveError) {
      console.error('[cron][github-hot-daily-backfill][save-last-run]', requestId, saveError)
    }

    console.info('[cron][github-hot-daily-backfill]', {
      requestId,
      health: health.state,
      status: result.status,
      slug: result.slug,
      repo: result.selectedRepo?.fullName,
      prUrl: result.publish?.prUrl,
      merged: result.publish?.merged,
      reason: result.reason
    })

    return ok(requestId, {
      health,
      result
    })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }

    console.error('[cron][github-hot-daily-backfill]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to run github hot daily backfill cron')
  }
}
