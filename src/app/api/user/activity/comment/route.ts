import { z } from 'zod'
import { getAuthSession } from '@/lib/auth'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { recordCommentActivity } from '@/lib/user/activity-service'

const payloadSchema = z.object({
  locale: z.enum(['zh', 'en']),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/),
  title: z.string().trim().min(1).max(200).optional()
})

export async function POST(request: Request) {
  const requestId = createRequestId()
  try {
    const payload = payloadSchema.parse(await request.json())
    const session = await getAuthSession()
    const login = session?.user?.login?.trim()

    if (!login) {
      return ok(requestId, {
        recorded: false,
        ignored: true
      })
    }

    await recordCommentActivity({
      login,
      locale: payload.locale,
      slug: payload.slug,
      title: payload.title || payload.slug
    })

    return ok(requestId, {
      recorded: true
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(requestId, 400, 'INVALID_INPUT', error.issues[0]?.message || 'Invalid input.')
    }
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[user][activity][comment][POST]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to record comment activity.')
  }
}
