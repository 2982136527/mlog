import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/admin/session'
import { listAdminPosts } from '@/lib/admin/posts-service'
import { publishPostChanges } from '@/lib/admin/publish-service'
import { AdminHttpError } from '@/lib/admin/errors'
import { adminPostSubmitSchema } from '@/lib/admin/post-serializer'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { warmupPublishedPages } from '@/lib/content/revalidation'

export async function GET(request: NextRequest) {
  const requestId = createRequestId()

  try {
    await requireAdminSession()

    const localeRaw = request.nextUrl.searchParams.get('locale')
    const keyword = request.nextUrl.searchParams.get('keyword') || ''
    const statusRaw = request.nextUrl.searchParams.get('status') || 'all'

    const locale = localeRaw === 'zh' || localeRaw === 'en' ? localeRaw : undefined
    const status = statusRaw === 'draft' || statusRaw === 'published' || statusRaw === 'all' ? statusRaw : 'all'

    const items = await listAdminPosts({
      locale,
      keyword,
      status
    })

    return ok(requestId, { items })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }

    console.error('[admin][posts][GET]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to load admin post list')
  }
}

export async function POST(request: NextRequest) {
  const requestId = createRequestId()

  try {
    const { login } = await requireAdminSession()
    const body = await request.json().catch(() => {
      throw new AdminHttpError(400, 'INVALID_JSON', 'Request body must be valid JSON.')
    })
    const payload = adminPostSubmitSchema.parse(body)

    const result = await publishPostChanges({
      slug: payload.slug,
      mode: payload.mode,
      changes: payload.changes,
      repoCards: payload.repoCards,
      actor: login,
      requestId,
      expectedAction: payload.expectedAction
    })

    console.info('[admin][posts][POST]', {
      requestId,
      actor: login,
      slug: payload.slug,
      mode: payload.mode,
      changedPaths: result.changedPaths,
      prUrl: result.result.prUrl,
      merged: result.result.merged,
      aiTriggered: result.ai.triggered
    })

    if (result.result.merged && result.result.branchSynchronized && result.result.cacheInvalidated) {
      const baseUrl =
        process.env.NEXT_PUBLIC_SITE_URL ||
        `${request.nextUrl.protocol}//${request.nextUrl.host}`
      await warmupPublishedPages(baseUrl, payload.slug).catch(() => undefined)
    }

    return ok(requestId, {
      slug: payload.slug,
      mode: payload.mode,
      changedPaths: result.changedPaths,
      publish: result.result,
      ai: result.ai
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      const first = error.issues[0]
      return fail(requestId, 400, 'INVALID_INPUT', `${first.path.join('.')}: ${first.message}`)
    }
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }

    console.error('[admin][posts][POST]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to publish post changes')
  }
}
