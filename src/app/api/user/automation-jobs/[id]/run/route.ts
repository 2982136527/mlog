import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { runUserAutomationJobNow } from '@/lib/user/jobs-service'
import { requireUserSession } from '@/lib/user/session'

type Params = {
  params: Promise<{ id: string }>
}

export async function POST(_request: Request, { params }: Params) {
  const requestId = createRequestId()
  try {
    const session = await requireUserSession()
    const { id } = await params
    if (!id.trim()) {
      return fail(requestId, 400, 'INVALID_INPUT', 'Job id is required.')
    }
    const run = await runUserAutomationJobNow(session.login, id, requestId)
    return ok(requestId, {
      run
    })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[user][automation-jobs][run][POST]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to run job.')
  }
}

