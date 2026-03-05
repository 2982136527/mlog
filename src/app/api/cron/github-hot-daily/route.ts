import { NextRequest } from 'next/server'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { runGithubHotDailyAutomation } from '@/lib/automation/github-hot/service'
import { saveGithubHotDailyLastRun } from '@/lib/automation/github-hot/run-state-store'

export const runtime = 'nodejs'
export const maxDuration = 300

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

export async function GET(request: NextRequest) {
  const requestId = createRequestId()

  try {
    requireCronAuth(request)

    const result = await runGithubHotDailyAutomation({
      actor: 'system:cron',
      requestId
    })

    try {
      await saveGithubHotDailyLastRun({
        requestId,
        actor: 'system:cron',
        result
      })
    } catch (saveError) {
      console.error('[cron][github-hot-daily][save-last-run]', requestId, saveError)
    }

    console.info('[cron][github-hot-daily]', {
      requestId,
      status: result.status,
      slug: result.slug,
      repo: result.selectedRepo?.fullName,
      prUrl: result.publish?.prUrl,
      merged: result.publish?.merged,
      reason: result.reason
    })

    return ok(requestId, {
      result
    })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }

    console.error('[cron][github-hot-daily]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to run github hot daily cron')
  }
}
