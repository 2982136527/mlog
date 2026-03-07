import { NextRequest } from 'next/server'
import { requireAdminSession } from '@/lib/admin/session'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { listContentMarkdownPaths } from '@/lib/admin/github-client'
import { buildAutomationHealth, getShanghaiDateContext, hasPublishedTodayByPrefix } from '@/lib/automation/daily-health'
import { BACKFILL_SCHEDULE_HOUR, DAILY_SCHEDULE_HOUR, GITHUB_HOT_DAILY_SLUG_PREFIX } from '@/lib/automation/github-hot/config'
import { loadGithubHotDailyConfig, saveGithubHotDailyConfig } from '@/lib/automation/github-hot/config-store'
import { loadGithubHotDailyLastRun } from '@/lib/automation/github-hot/run-state-store'
import { parseGithubHotDailyConfigUpdate } from '@/lib/automation/github-hot/config'

export async function GET() {
  const requestId = createRequestId()

  try {
    await requireAdminSession()
    const [loaded, lastRun, paths] = await Promise.all([loadGithubHotDailyConfig(), loadGithubHotDailyLastRun(), listContentMarkdownPaths()])
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
    return ok(requestId, {
      config: loaded.config,
      lastRun,
      health
    })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }

    console.error('[admin][automation][github-hot-daily][GET]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to load automation config')
  }
}

export async function PUT(request: NextRequest) {
  const requestId = createRequestId()

  try {
    const { login } = await requireAdminSession()
    const payload = await request.json()
    const loaded = await loadGithubHotDailyConfig()
    const update = parseGithubHotDailyConfigUpdate(payload, loaded.config)
    const nextConfig = {
      ...loaded.config,
      enabled: update.enabled,
      interestPreset: update.interestPreset,
      topicKeywords: update.topicKeywords,
      excludeKeywords: update.excludeKeywords,
      minStars: update.minStars,
      candidateWindow: update.candidateWindow,
      diversifyByLanguage: update.diversifyByLanguage,
      updatedAt: new Date().toISOString(),
      updatedBy: 'admin' as const
    }

    const saved = await saveGithubHotDailyConfig({
      config: nextConfig,
      actor: login,
      requestId
    })

    console.info('[admin][automation][github-hot-daily][PUT]', {
      requestId,
      enabled: saved.config.enabled,
      interestPreset: saved.config.interestPreset,
      topicKeywords: saved.config.topicKeywords,
      excludeKeywords: saved.config.excludeKeywords,
      minStars: saved.config.minStars,
      candidateWindow: saved.config.candidateWindow,
      diversifyByLanguage: saved.config.diversifyByLanguage,
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

    console.error('[admin][automation][github-hot-daily][PUT]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to update automation config')
  }
}
