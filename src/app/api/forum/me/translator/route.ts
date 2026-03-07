import { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { z } from 'zod'
import { getAuthSession } from '@/lib/auth'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { deleteForumGeminiSecret, getForumTranslatorProfile, hasGistScope, upsertForumGeminiSecret } from '@/lib/forum/translator-secret'

const updateTranslatorSchema = z.object({
  apiKey: z.string().trim().min(1).max(300),
  model: z.string().trim().min(1).max(120).optional()
})

async function resolveAuth(request: NextRequest): Promise<{
  login: string
  accessToken: string
}> {
  const session = await getAuthSession()
  const login = session?.user?.login?.trim()
  if (!login) {
    throw new AdminHttpError(401, 'UNAUTHORIZED', 'Authentication required.')
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET
  })
  const accessToken = typeof token?.githubAccessToken === 'string' ? token.githubAccessToken : ''
  const scope = typeof token?.githubScope === 'string' ? token.githubScope : ''

  if (!accessToken || !hasGistScope(scope)) {
    throw new AdminHttpError(403, 'FORUM_SCOPE_REQUIRED', 'GitHub gist scope is required for translator key storage.')
  }

  return {
    login,
    accessToken
  }
}

export async function GET(request: NextRequest) {
  const requestId = createRequestId()
  try {
    const auth = await resolveAuth(request)
    const profile = await getForumTranslatorProfile({
      accessToken: auth.accessToken
    })

    return ok(requestId, {
      profile
    })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[forum][translator][GET]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to load translator profile.')
  }
}

export async function PUT(request: NextRequest) {
  const requestId = createRequestId()
  try {
    const auth = await resolveAuth(request)
    const payload = updateTranslatorSchema.parse(await request.json())

    const profile = await upsertForumGeminiSecret({
      accessToken: auth.accessToken,
      login: auth.login,
      apiKey: payload.apiKey,
      model: payload.model
    })

    return ok(requestId, {
      profile
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(requestId, 400, 'FORUM_INVALID_INPUT', error.issues[0]?.message || 'Invalid translator payload.')
    }
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[forum][translator][PUT]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to update translator profile.')
  }
}

export async function DELETE(request: NextRequest) {
  const requestId = createRequestId()
  try {
    const auth = await resolveAuth(request)

    const profile = await deleteForumGeminiSecret({
      accessToken: auth.accessToken,
      login: auth.login
    })

    return ok(requestId, {
      profile
    })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[forum][translator][DELETE]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to delete translator profile.')
  }
}
