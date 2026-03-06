import { z } from 'zod'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { createUserAutomationJob, listUserAutomationJobs } from '@/lib/user/jobs-service'
import { requireUserSession } from '@/lib/user/session'

const createSchema = z.object({
  providerId: z.string().trim().min(1),
  topic: z.string().trim().min(1).max(200),
  cronExpr: z.string().trim().min(1),
  timezone: z.string().trim().optional(),
  enabled: z.boolean().optional()
})

export async function GET() {
  const requestId = createRequestId()
  try {
    const session = await requireUserSession()
    const jobs = await listUserAutomationJobs(session.login)
    return ok(requestId, {
      jobs
    })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[user][automation-jobs][GET]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to load jobs.')
  }
}

export async function POST(request: Request) {
  const requestId = createRequestId()
  try {
    const session = await requireUserSession()
    const payload = createSchema.parse(await request.json())
    const job = await createUserAutomationJob(session.login, payload)
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
    console.error('[user][automation-jobs][POST]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to create job.')
  }
}

