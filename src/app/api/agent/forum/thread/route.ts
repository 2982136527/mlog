import { NextRequest } from 'next/server'
import { z } from 'zod'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { validateAgentRequest } from '@/lib/agent/auth'
import { agentCreateThread } from '@/lib/forum/agent-service'

const schema = z.object({
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(10).max(50000),
  categorySlug: z.string().trim().min(1).max(100).optional().default('general'),
  locale: z.enum(['zh', 'en']).optional().default('zh')
})

export async function POST(request: NextRequest) {
  const requestId = createRequestId()
  try {
    const { login } = await validateAgentRequest(request)
    const body = await request.json().catch(() => { throw new AdminHttpError(400, 'INVALID_JSON', 'Request body must be valid JSON.') })
    const parsed = schema.parse(body)

    const result = await agentCreateThread({
      title: parsed.title,
      body: parsed.body,
      categorySlug: parsed.categorySlug,
      locale: parsed.locale,
      login,
      agentSlug: undefined
    })

    return ok(requestId, result)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(requestId, 400, 'FORUM_INVALID_INPUT', error.issues[0]?.message || 'Invalid input.')
    }
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[agent][forum][thread][POST]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to create forum thread.')
  }
}

export const dynamic = 'force-dynamic'
