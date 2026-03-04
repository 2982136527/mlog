import { NextRequest } from 'next/server'
import { requireAdminSession } from '@/lib/admin/session'
import { listAdminPosts } from '@/lib/admin/posts-service'
import { publishPostChanges } from '@/lib/admin/publish-service'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import type { AdminPostSubmitRequest, AdminSubmitMode } from '@/types/admin'

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
    const payload = (await request.json()) as AdminPostSubmitRequest
    const mode: AdminSubmitMode = payload.mode === 'draft' ? 'draft' : 'publish'

    const result = await publishPostChanges({
      slug: payload.slug,
      mode,
      changes: payload.changes,
      actor: login,
      requestId
    })

    console.info('[admin][posts][POST]', {
      requestId,
      actor: login,
      slug: payload.slug,
      mode,
      changedPaths: result.changedPaths,
      prUrl: result.result.prUrl,
      merged: result.result.merged,
      aiTriggered: result.ai.triggered
    })

    return ok(requestId, {
      slug: payload.slug,
      mode,
      changedPaths: result.changedPaths,
      publish: result.result,
      ai: result.ai
    })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }

    console.error('[admin][posts][POST]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to publish post changes')
  }
}
