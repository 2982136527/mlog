import { NextRequest } from 'next/server'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { dispatchDueUserAutomationJobs } from '@/lib/user/jobs-service'

export const runtime = 'nodejs'
export const maxDuration = 300

function requireCronAuth(request: NextRequest) {
  const expected = (process.env.CRON_SECRET || '').trim()
  if (!expected) {
    throw new AdminHttpError(500, 'CRON_SECRET_MISSING', 'CRON_SECRET is not configured.')
  }
  const authHeader = request.headers.get('authorization') || ''
  if (authHeader !== `Bearer ${expected}`) {
    throw new AdminHttpError(401, 'UNAUTHORIZED', 'Invalid cron authorization header.')
  }
}

export async function GET(request: NextRequest) {
  const requestId = createRequestId()
  try {
    requireCronAuth(request)
    const summary = await dispatchDueUserAutomationJobs({
      requestId,
      limit: 20
    })
    console.info('[cron][user-automation-dispatch]', {
      requestId,
      ...summary
    })
    return ok(requestId, {
      summary
    })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[cron][user-automation-dispatch]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to dispatch user automation jobs.')
  }
}

