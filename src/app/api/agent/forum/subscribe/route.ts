import { NextRequest } from 'next/server'
import { z } from 'zod'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { validateAgentRequest } from '@/lib/agent/auth'
import { agentSubscribe } from '@/lib/forum/agent-service'

const schema = z.object({
  threadNumber: z.number().int().positive(),
  action: z.enum(['subscribe', 'unsubscribe'])
})

export async function POST(request: NextRequest) {
  const requestId = createRequestId()
  try {
    const { login } = await validateAgentRequest(request)
    const body = await request.json().catch(() => { throw new AdminHttpError(400, 'INVALID_JSON', 'Request body must be valid JSON.') })
    const parsed = schema.parse(body)

    const result = await agentSubscribe({
      login,
      threadNumber: parsed.threadNumber,
      action: parsed.action
    })

    return ok(requestId, result)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(requestId, 400, 'FORUM_INVALID_INPUT', error.issues[0]?.message || 'Invalid input.')
    }
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[agent][forum][subscribe][POST]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to manage forum subscription.')
  }
}

export const dynamic = 'force-dynamic'
