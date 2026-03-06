import { z } from 'zod'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { deleteUserAutomationJob, updateUserAutomationJob } from '@/lib/user/jobs-service'
import { requireUserSession } from '@/lib/user/session'

const updateSchema = z.object({
  providerId: z.string().trim().min(1).optional(),
  topic: z.string().trim().min(1).max(200).optional(),
  cronExpr: z.string().trim().min(1).optional(),
  timezone: z.string().trim().optional(),
  enabled: z.boolean().optional()
})

type Params = {
  params: Promise<{ id: string }>
}

export async function PUT(request: Request, { params }: Params) {
  const requestId = createRequestId()
  try {
    const session = await requireUserSession()
    const { id } = await params
    if (!id.trim()) {
      return fail(requestId, 400, 'INVALID_INPUT', 'Job id is required.')
    }
    const payload = updateSchema.parse(await request.json())
    const job = await updateUserAutomationJob(session.login, id, payload)
    return ok(requestId, {
      job
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(requestId, 400, 'INVALID_INPUT', error.issues[0]?.message || 'Invalid input.')
    }
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[user][automation-jobs][PUT]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to update job.')
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const requestId = createRequestId()
  try {
    const session = await requireUserSession()
    const { id } = await params
    if (!id.trim()) {
      return fail(requestId, 400, 'INVALID_INPUT', 'Job id is required.')
    }
    await deleteUserAutomationJob(session.login, id)
    return ok(requestId, {
      deleted: true
    })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[user][automation-jobs][DELETE]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to delete job.')
  }
}

