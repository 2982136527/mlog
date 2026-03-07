import { NextRequest } from 'next/server'
import { requireAdminSession } from '@/lib/admin/session'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { listContentMarkdownPaths } from '@/lib/admin/github-client'
import { buildAutomationHealth, getShanghaiDateContext, hasPublishedTodayByPrefix, parseLocalScheduleTime } from '@/lib/automation/daily-health'
import { AI_PAPER_DAILY_BACKFILL_TIME, AI_PAPER_DAILY_SLUG_PREFIX } from '@/lib/automation/ai-paper/config'
import { loadAiPaperDailyConfig, saveAiPaperDailyConfig } from '@/lib/automation/ai-paper/config-store'
import { loadAiPaperDailyLastRun } from '@/lib/automation/ai-paper/run-state-store'
import { parseAiPaperDailyConfigUpdate } from '@/lib/automation/ai-paper/config'

export async function GET() {
  const requestId = createRequestId()

  try {
    await requireAdminSession()
    const [loaded, lastRun, paths] = await Promise.all([loadAiPaperDailyConfig(), loadAiPaperDailyLastRun(), listContentMarkdownPaths()])
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
    return ok(requestId, {
      config: loaded.config,
      lastRun,
      health
    })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }

    console.error('[admin][automation][ai-paper-daily][GET]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to load automation config')
  }
}

export async function PUT(request: NextRequest) {
  const requestId = createRequestId()

  try {
    const { login } = await requireAdminSession()
    const payload = await request.json()
    const loaded = await loadAiPaperDailyConfig()
    const update = parseAiPaperDailyConfigUpdate(payload, loaded.config)
    const nextConfig = {
      ...loaded.config,
      enabled: update.enabled,
      arxivCategories: update.arxivCategories,
      maxCandidates: update.maxCandidates,
      minSignalsScore: update.minSignalsScore,
      includeCodeFirst: update.includeCodeFirst,
      updatedAt: new Date().toISOString(),
      updatedBy: 'admin' as const
    }

    const saved = await saveAiPaperDailyConfig({
      config: nextConfig,
      actor: login,
      requestId
    })

    console.info('[admin][automation][ai-paper-daily][PUT]', {
      requestId,
      enabled: saved.config.enabled,
      arxivCategories: saved.config.arxivCategories,
      maxCandidates: saved.config.maxCandidates,
      minSignalsScore: saved.config.minSignalsScore,
      includeCodeFirst: saved.config.includeCodeFirst,
      changed: saved.changed,
      prUrl: saved.publish?.prUrl,
      merged: saved.publish?.merged
    })

    return ok(requestId, {
      config: saved.config,
      changed: saved.changed,
      publish: saved.publish
    })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }

    console.error('[admin][automation][ai-paper-daily][PUT]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to update automation config')
  }
}
