import { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { z } from 'zod'
import { getAuthSession } from '@/lib/auth'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { checkForumRateLimit } from '@/lib/forum/rate-limit'
import { getForumScopeState } from '@/lib/forum/scope'
import { createForumReply } from '@/lib/forum/service'

const replySchema = z.object({
  body: z.string().trim().min(2).max(20000)
})

function parseThreadNumber(value: string): number {
  const number = Number.parseInt(value, 10)
  if (!Number.isFinite(number) || number <= 0) {
    throw new AdminHttpError(400, 'FORUM_INVALID_INPUT', 'Invalid thread number.')
  }
  return number
}

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim()
  }
  const realIp = request.headers.get('x-real-ip')
  return realIp?.trim() || 'unknown'
}

type ThreadReplyRouteProps = {
  params: Promise<{
    number: string
  }>
}

export async function POST(request: NextRequest, { params }: ThreadReplyRouteProps) {
  const requestId = createRequestId()
  try {
    const session = await getAuthSession()
    const login = session?.user?.login?.trim()
    if (!login) {
      return fail(requestId, 401, 'UNAUTHORIZED', 'Authentication required.')
    }

    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET
    })
    const scope = typeof token?.githubScope === 'string' ? token.githubScope : ''
    const accessToken = typeof token?.githubAccessToken === 'string' ? token.githubAccessToken : ''
    const scopeState = getForumScopeState(scope)
    if (!scopeState.hasDiscussionWriteScope || !accessToken) {
      return fail(requestId, 403, 'FORUM_SCOPE_REQUIRED', 'GitHub discussion write scope is required.')
    }

    const ip = getClientIp(request)
    const limiter = checkForumRateLimit({
      key: `reply:${login.toLowerCase()}:${ip}`,
      limit: 20,
      windowMs: 10 * 60 * 1000
    })
    if (!limiter.allowed) {
      return fail(requestId, 429, 'FORUM_RATE_LIMITED', 'Too many reply submissions. Please try again later.', {
        resetAt: new Date(limiter.resetAt).toISOString()
      })
    }

    const { number: rawNumber } = await params
    const number = parseThreadNumber(rawNumber)
    const payload = replySchema.parse(await request.json())

    const reply = await createForumReply({
      accessToken,
      number,
      body: payload.body
    })

    return ok(requestId, {
      reply
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(requestId, 400, 'FORUM_INVALID_INPUT', error.issues[0]?.message || 'Invalid reply payload.')
    }
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[forum][reply][POST]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to create forum reply.')
  }
}
