import { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { z } from 'zod'
import { getAuthSession } from '@/lib/auth'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { checkForumRateLimit } from '@/lib/forum/rate-limit'
import { getForumScopeState } from '@/lib/forum/scope'
import { resolveForumGeminiSecret, hasGistScope } from '@/lib/forum/translator-secret'
import { translateForumThreadWithGemini } from '@/lib/forum/translation'
import { createForumThread, listForumThreads } from '@/lib/forum/service'

const createThreadSchema = z.object({
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(10).max(20000),
  categorySlug: z.string().trim().min(1).max(100),
  sourceLocale: z.enum(['zh', 'en']).optional().default('zh'),
  autoTranslate: z.boolean().optional().default(false),
  gemini: z
    .object({
      apiKey: z.string().trim().min(1).max(300).optional(),
      model: z.string().trim().min(1).max(120).optional()
    })
    .optional()
})

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim()
  }
  const realIp = request.headers.get('x-real-ip')
  return realIp?.trim() || 'unknown'
}

export async function GET(request: NextRequest) {
  const requestId = createRequestId()
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') || undefined
    const cursor = searchParams.get('cursor') || undefined
    const q = searchParams.get('q') || undefined
    const contentLocale = searchParams.get('contentLocale') || searchParams.get('locale') || undefined

    const payload = await listForumThreads({
      categorySlug: category,
      cursor,
      q,
      contentLocale: contentLocale === 'en' ? 'en' : 'zh'
    })

    return ok(requestId, payload)
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[forum][threads][GET]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to load forum threads.')
  }
}

export async function POST(request: NextRequest) {
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
      key: `thread:${login.toLowerCase()}:${ip}`,
      limit: 5,
      windowMs: 10 * 60 * 1000
    })
    if (!limiter.allowed) {
      return fail(requestId, 429, 'FORUM_RATE_LIMITED', 'Too many thread submissions. Please try again later.', {
        resetAt: new Date(limiter.resetAt).toISOString()
      })
    }

    const payload = createThreadSchema.parse(await request.json())
    const autoTranslate = Boolean(payload.autoTranslate)
    const sourceLocale = payload.sourceLocale
    const targetLocale = sourceLocale === 'zh' ? 'en' : 'zh'

    let created: Awaited<ReturnType<typeof createForumThread>>
    if (!autoTranslate) {
      created = await createForumThread({
        accessToken,
        title: payload.title,
        body: payload.body,
        categorySlug: payload.categorySlug,
        sourceLocale
      })
    } else {
      if (!hasGistScope(scope)) {
        return fail(requestId, 403, 'FORUM_SCOPE_REQUIRED', 'Gemini key storage requires gist scope.')
      }

      const resolvedSecret = await resolveForumGeminiSecret({
        accessToken,
        login,
        apiKey: payload.gemini?.apiKey,
        model: payload.gemini?.model
      })

      if (!resolvedSecret.apiKey) {
        return fail(requestId, 400, 'FORUM_TRANSLATOR_KEY_REQUIRED', 'Gemini API key is required for auto translation.')
      }

      const translated = await translateForumThreadWithGemini({
        apiKey: resolvedSecret.apiKey,
        model: resolvedSecret.model,
        sourceLocale,
        targetLocale,
        title: payload.title,
        body: payload.body
      })

      created = await createForumThread({
        accessToken,
        title: payload.title,
        body: payload.body,
        categorySlug: payload.categorySlug,
        sourceLocale,
        mirror: {
          title: translated.title,
          body: translated.body,
          locale: targetLocale
        }
      })
    }

    return ok(requestId, {
      thread: created.thread,
      mirror: created.mirror,
      translationStatus: created.translationStatus
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(requestId, 400, 'FORUM_INVALID_INPUT', error.issues[0]?.message || 'Invalid thread payload.')
    }
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[forum][threads][POST]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to create forum thread.')
  }
}
