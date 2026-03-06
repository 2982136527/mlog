import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { listUserAutomationRuns } from '@/lib/user/jobs-service'
import { requireUserSession } from '@/lib/user/session'

export async function GET(request: Request) {
  const requestId = createRequestId()
  try {
    const session = await requireUserSession()
    const url = new URL(request.url)
    const jobId = (url.searchParams.get('jobId') || '').trim() || undefined
    const runs = await listUserAutomationRuns(session.login, jobId)
    return ok(requestId, {
      runs
    })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[user][automation-runs][GET]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to load run history.')
  }
}

