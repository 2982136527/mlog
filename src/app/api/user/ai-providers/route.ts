import { z } from 'zod'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { createUserAiProvider, listUserAiProviders } from '@/lib/user/providers-service'
import { requireUserSession } from '@/lib/user/session'

const createSchema = z.object({
  provider: z.enum(['gemini', 'openai', 'deepseek', 'qwen']),
  model: z.string().trim().min(1).max(160),
  baseUrl: z.string().trim().optional(),
  apiKey: z.string().trim().min(1),
  enabled: z.boolean().optional()
})

export async function GET() {
  const requestId = createRequestId()
  try {
    const session = await requireUserSession()
    const providers = await listUserAiProviders(session.login)
    return ok(requestId, {
      providers
    })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[user][ai-providers][GET]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to load providers.')
  }
}

export async function POST(request: Request) {
  const requestId = createRequestId()
  try {
    const session = await requireUserSession()
    const payload = createSchema.parse(await request.json())
    const provider = await createUserAiProvider(session.login, payload)
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
    console.error('[user][ai-providers][POST]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to create provider.')
  }
}

