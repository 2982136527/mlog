import { NextRequest } from 'next/server'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { runAiPaperDailyAutomation } from '@/lib/automation/ai-paper/service'
import { saveAiPaperDailyLastRun } from '@/lib/automation/ai-paper/run-state-store'

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

    const result = await runAiPaperDailyAutomation({
      actor: 'system:cron',
      requestId
    })

    try {
      await saveAiPaperDailyLastRun({
        requestId,
        actor: 'system:cron',
        result
      })
    } catch (saveError) {
      console.error('[cron][ai-paper-daily][save-last-run]', requestId, saveError)
    }

    console.info('[cron][ai-paper-daily]', {
      requestId,
      status: result.status,
      slug: result.slug,
      arxivId: result.selectedPaper?.arxivId,
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

    console.error('[cron][ai-paper-daily]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to run ai paper daily cron')
  }
}
