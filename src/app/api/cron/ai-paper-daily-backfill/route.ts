import { NextRequest } from 'next/server'
import type { AiPaperDailyRunResult } from '@/types/automation'
import { AdminHttpError } from '@/lib/admin/errors'
import { listContentMarkdownPaths } from '@/lib/admin/github-client'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { buildAutomationHealth, getShanghaiDateContext, hasPublishedTodayByPrefix, parseLocalScheduleTime } from '@/lib/automation/daily-health'
import { AI_PAPER_DAILY_BACKFILL_TIME, AI_PAPER_DAILY_SLUG_PREFIX } from '@/lib/automation/ai-paper/config'
import { loadAiPaperDailyConfig } from '@/lib/automation/ai-paper/config-store'
import { saveAiPaperDailyLastRun } from '@/lib/automation/ai-paper/run-state-store'
import { runAiPaperDailyAutomation } from '@/lib/automation/ai-paper/service'

export const runtime = 'nodejs'
export const maxDuration = 300

const FIXED_TAGS = ['ai-paper', 'paper-daily'] as const

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

function buildSkippedResult(input: {
  status: 'SKIPPED_DISABLED' | 'SKIPPED_ALREADY_HEALTHY'
  dateStamp: string
  dateIso: string
  reason: string
}): AiPaperDailyRunResult {
  return {
    status: input.status,
    dateStamp: input.dateStamp,
    dateIso: input.dateIso,
    triggerSource: 'cron_backfill',
    fixedTags: [...FIXED_TAGS],
    reason: input.reason
  }
}

export async function GET(request: NextRequest) {
  const requestId = createRequestId()

  try {
    requireCronAuth(request)

    const [loaded, paths] = await Promise.all([loadAiPaperDailyConfig(), listContentMarkdownPaths()])
    const today = getShanghaiDateContext()
    const mainSchedule = parseLocalScheduleTime(loaded.config.scheduleLocalTime)
    const backfillSchedule = parseLocalScheduleTime(AI_PAPER_DAILY_BACKFILL_TIME)
    const hasPublishedToday = hasPublishedTodayByPrefix(paths, AI_PAPER_DAILY_SLUG_PREFIX, today.dateStamp)
    const health = buildAutomationHealth({
      enabled: loaded.config.enabled,
      dateStamp: today.dateStamp,
      dateIso: today.dateIso,
      minutesOfDay: today.minutesOfDay,
      expectedHour: mainSchedule.hour,
      expectedMinute: mainSchedule.minute,
      backfillHour: backfillSchedule.hour,
      backfillMinute: backfillSchedule.minute,
      hasPublishedToday
    })

    let result: AiPaperDailyRunResult
    if (health.state === 'missed') {
      result = await runAiPaperDailyAutomation({
        actor: 'system:cron-backfill',
        requestId,
        triggerSource: 'cron_backfill'
      })
    } else if (health.state === 'disabled') {
      result = buildSkippedResult({
        status: 'SKIPPED_DISABLED',
        dateStamp: today.dateStamp,
        dateIso: today.dateIso,
        reason: 'automation disabled'
      })
    } else {
      result = buildSkippedResult({
        status: 'SKIPPED_ALREADY_HEALTHY',
        dateStamp: today.dateStamp,
        dateIso: today.dateIso,
        reason: `health=${health.state}, hasPublishedToday=${health.hasPublishedToday}`
      })
    }

    try {
      await saveAiPaperDailyLastRun({
        requestId,
        actor: 'system:cron-backfill',
        result
      })
    } catch (saveError) {
      console.error('[cron][ai-paper-daily-backfill][save-last-run]', requestId, saveError)
    }

    console.info('[cron][ai-paper-daily-backfill]', {
      requestId,
      health: health.state,
      status: result.status,
      slug: result.slug,
      arxivId: result.selectedPaper?.arxivId,
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

    console.error('[cron][ai-paper-daily-backfill]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to run ai paper daily backfill cron')
  }
}
