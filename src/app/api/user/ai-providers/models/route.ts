import { z } from 'zod'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { discoverProviderModels } from '@/lib/user/model-discovery-service'
import { requireUserSession } from '@/lib/user/session'

const discoverSchema = z.object({
  provider: z.enum(['gemini', 'openai', 'deepseek', 'qwen']),
  apiKey: z.string().trim().min(1),
  baseUrl: z.string().trim().optional(),
  includeAll: z.boolean().optional()
})

export async function POST(request: Request) {
  const requestId = createRequestId()
  try {
    await requireUserSession()
    const payload = discoverSchema.parse(await request.json())
    const result = await discoverProviderModels(payload)
    return ok(requestId, result)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(requestId, 400, 'INVALID_INPUT', error.issues[0]?.message || 'Invalid input.')
    }
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[user][ai-providers][models][POST]', requestId, error)
    return fail(requestId, 500, 'MODEL_DISCOVERY_FAILED', 'Failed to discover models.')
  }
}
