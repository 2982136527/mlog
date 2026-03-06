import { z } from 'zod'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { deleteUserAiProvider, updateUserAiProvider } from '@/lib/user/providers-service'
import { requireUserSession } from '@/lib/user/session'

const updateSchema = z.object({
  provider: z.enum(['gemini', 'openai', 'deepseek', 'qwen']).optional(),
  model: z.string().trim().min(1).max(160).optional(),
  baseUrl: z.string().trim().optional(),
  apiKey: z.string().trim().min(1).optional(),
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
      return fail(requestId, 400, 'INVALID_INPUT', 'Provider id is required.')
    }
    const payload = updateSchema.parse(await request.json())
    const provider = await updateUserAiProvider(session.login, id, payload)
    return ok(requestId, {
      provider
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(requestId, 400, 'INVALID_INPUT', error.issues[0]?.message || 'Invalid input.')
    }
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[user][ai-providers][PUT]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to update provider.')
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const requestId = createRequestId()
  try {
    const session = await requireUserSession()
    const { id } = await params
    if (!id.trim()) {
      return fail(requestId, 400, 'INVALID_INPUT', 'Provider id is required.')
    }
    await deleteUserAiProvider(session.login, id)
    return ok(requestId, {
      deleted: true
    })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[user][ai-providers][DELETE]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to delete provider.')
  }
}

