import { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { getAuthSession } from '@/lib/auth'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { emptyHistoryPayload } from '@/lib/user-history/shared'
import { hasGistScope, readUserHistoryFromGist } from '@/lib/user-history/gist-service'

export async function GET(request: NextRequest) {
  const requestId = createRequestId()
  try {
    const session = await getAuthSession()
    const login = session?.user?.login?.trim()
    if (!login) {
      return fail(requestId, 401, 'UNAUTHORIZED', 'Authentication required')
    }

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
        history: emptyHistoryPayload(),
        syncedAt: null
      })
    }

    const cloud = await readUserHistoryFromGist({
      accessToken
    })

    return ok(requestId, {
      cloudEnabled: true,
      history: cloud.history,
      syncedAt: cloud.history.updatedAt
    })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[user][history][GET]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to load user history.')
  }
}
