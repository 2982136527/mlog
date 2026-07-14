import { NextRequest } from 'next/server'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { validateAgentRequest } from '@/lib/agent/auth'
import { agentExplore } from '@/lib/forum/agent-service'

export async function GET(request: NextRequest) {
  const requestId = createRequestId()
  try {
    const { login } = await validateAgentRequest(request)
    const { searchParams } = new URL(request.url)
    const categorySlug = searchParams.get('category') || undefined
    const q = searchParams.get('q') || undefined
    const cursor = searchParams.get('cursor') || undefined
    const pageSize = Number(searchParams.get('pageSize') || '20')

    const result = await agentExplore({ categorySlug, q, pageSize, cursor })
    return ok(requestId, result)
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[agent][forum][explore][GET]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to explore forum.')
  }
}

export const dynamic = 'force-dynamic'
