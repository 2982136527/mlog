import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/admin/session'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { getAiRuntimeAvailability } from '@/lib/ai/config'
import { loadDailyBlogConfig, updateDailyBlogConfig } from '@/lib/automation/daily-blog/config-store'
import { loadDailyBlogLastRun } from '@/lib/automation/daily-blog/run-state-store'

export async function GET() {
  const requestId = createRequestId()

  try {
    await requireAdminSession()
    const [{ config }, lastRun] = await Promise.all([loadDailyBlogConfig(), loadDailyBlogLastRun()])
    return ok(requestId, {
      config,
      lastRun,
      ai: getAiRuntimeAvailability()
    })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[admin][automation][daily-blog][GET]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to load daily blog automation config.')
  }
}

export async function PUT(request: NextRequest) {
  const requestId = createRequestId()

  try {
    const { login } = await requireAdminSession()
    const body = await request.json().catch(() => {
      throw new AdminHttpError(400, 'INVALID_JSON', 'Request body must be valid JSON.')
    })
    const saved = await updateDailyBlogConfig(body, login, requestId)

    return ok(requestId, {
      config: saved.config,
      publish: saved.publish
    }, { status: saved.publish.merged ? 200 : 202 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      const first = error.issues[0]
      return fail(requestId, 400, 'INVALID_INPUT', `${first.path.join('.')}: ${first.message}`)
    }
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[admin][automation][daily-blog][PUT]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to update daily blog automation config.')
  }
}
