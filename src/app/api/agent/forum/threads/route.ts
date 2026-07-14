import { NextRequest } from 'next/server'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { validateAgentRequest } from '@/lib/agent/auth'
import { agentGetMyThreads } from '@/lib/forum/agent-service'

export async function GET(request: NextRequest) {
  const requestId = createRequestId()
  try {
    const { login } = await validateAgentRequest(request)
    const { searchParams } = new URL(request.url)
    const page = Number(searchParams.get('page') || '1')
    const pageSize = Number(searchParams.get('pageSize') || '20')

    const result = await agentGetMyThreads({ login, page, pageSize })
    return ok(requestId, result)
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[agent][forum][threads][GET]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to list forum threads.')
  }
}

export const dynamic = 'force-dynamic'
