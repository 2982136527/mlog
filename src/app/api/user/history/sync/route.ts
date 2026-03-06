import { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { z } from 'zod'
import { getAuthSession } from '@/lib/auth'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { hasGistScope, syncUserHistoryToGist } from '@/lib/user-history/gist-service'
import { normalizeHistoryPayload } from '@/lib/user-history/shared'

const itemSchema = z.object({
  locale: z.enum(['zh', 'en']),
  slug: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(300),
  firstAt: z.string().trim().min(1),
  lastAt: z.string().trim().min(1),
  count: z.number().int().min(1).max(100000)
})

const payloadSchema = z.object({
  history: z.object({
    read: z.array(itemSchema).max(500),
    comment: z.array(itemSchema).max(500),
    updatedAt: z.string().trim().optional()
  })
})

export async function POST(request: NextRequest) {
  const requestId = createRequestId()
  try {
    const session = await getAuthSession()
    const login = session?.user?.login?.trim()
    if (!login) {
      return fail(requestId, 401, 'UNAUTHORIZED', 'Authentication required')
    }

    const parsed = payloadSchema.parse(await request.json())
    const localHistory = normalizeHistoryPayload(parsed.history)

    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET
    })
    const scope = typeof token?.githubScope === 'string' ? token.githubScope : ''
    const accessToken = typeof token?.githubAccessToken === 'string' ? token.githubAccessToken : ''
    const gistEnabled = hasGistScope(scope) && Boolean(accessToken)

    if (!gistEnabled) {
      return ok(requestId, {
        cloudEnabled: false,
        synced: false,
        uploadedCount: 0,
        syncedAt: null,
        history: localHistory
      })
    }

    const synced = await syncUserHistoryToGist({
      login,
      accessToken,
      localHistory
    })

    return ok(requestId, {
      cloudEnabled: true,
      synced: true,
      uploadedCount: synced.uploadedCount,
      syncedAt: synced.syncedAt,
      history: synced.history
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(requestId, 400, 'INVALID_INPUT', error.issues[0]?.message || 'Invalid input.')
    }
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[user][history][sync][POST]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to sync user history.')
  }
}
