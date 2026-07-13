import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/admin/session'
import { getAdminPostDetail } from '@/lib/admin/posts-service'
import { deletePostBySlug } from '@/lib/admin/publish-service'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'

export async function GET(_: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const requestId = createRequestId()

  try {
    await requireAdminSession()
    const { slug } = await params
    const detail = await getAdminPostDetail(slug)

    return ok(requestId, detail)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const first = error.issues[0]
      return fail(requestId, 400, 'INVALID_INPUT', `${first.path.join('.')}: ${first.message}`)
    }
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }

    console.error('[admin][post][GET]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to load admin post detail')
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const requestId = createRequestId()

  try {
    const { login } = await requireAdminSession()
    const { slug } = await params
    const locale = z.enum(['zh', 'en', 'all']).parse(request.nextUrl.searchParams.get('locale') ?? 'all')

    const result = await deletePostBySlug({
      slug,
      locale,
      actor: login,
      requestId
    })

    console.info('[admin][post][DELETE]', {
      requestId,
      actor: login,
      slug,
      locale,
      deletedPaths: result.deletedPaths,
      prUrl: result.result.prUrl,
      merged: result.result.merged
    })

    return ok(requestId, {
      slug,
      locale,
      deletedPaths: result.deletedPaths,
      publish: result.result
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      const first = error.issues[0]
      return fail(requestId, 400, 'INVALID_INPUT', `${first.path.join('.')}: ${first.message}`)
    }
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }

    console.error('[admin][post][DELETE]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to delete post')
  }
}
