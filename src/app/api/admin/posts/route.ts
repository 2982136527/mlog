import { NextRequest } from 'next/server'
import { requireAdminSession } from '@/lib/admin/session'
import { listAdminPosts } from '@/lib/admin/posts-service'
import { publishPostChanges } from '@/lib/admin/publish-service'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'

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
      return fail(requestId, error.status, error.code, error.message)
    }

    console.error('[admin][posts][GET]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to load admin post list')
  }
}

export async function POST(request: NextRequest) {
  const requestId = createRequestId()

  try {
    const { login } = await requireAdminSession()
    const payload = (await request.json()) as {
      slug: string
      changes: Array<{
        locale: 'zh' | 'en'
        frontmatter: {
          title: string
          date: string
          summary: string
          tags: string[]
          category: string
          cover?: string
          draft?: boolean
          updated?: string
        }
        markdown: string
        baseSha?: string | null
      }>
    }

    const result = await publishPostChanges({
      slug: payload.slug,
      changes: payload.changes,
      actor: login,
      requestId
    })

    console.info('[admin][posts][POST]', {
      requestId,
      actor: login,
      slug: payload.slug,
      changedPaths: result.changedPaths,
      prUrl: result.result.prUrl,
      merged: result.result.merged
    })

    return ok(requestId, {
      slug: payload.slug,
      changedPaths: result.changedPaths,
      publish: result.result
    })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message)
    }

    console.error('[admin][posts][POST]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to publish post changes')
  }
}
