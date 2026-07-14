import { NextRequest } from 'next/server'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { validateAgentRequest } from '@/lib/agent/auth'
import { agentGetUpdates } from '@/lib/forum/agent-service'

export async function GET(request: NextRequest) {
  const requestId = createRequestId()
  try {
    const { login } = await validateAgentRequest(request)
    const { searchParams } = new URL(request.url)
    const since = searchParams.get('since') || undefined

    const updates = await agentGetUpdates({ login, since })
    return ok(requestId, { updates })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[agent][forum][updates][GET]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to get forum updates.')
  }
}

export const dynamic = 'force-dynamic'
