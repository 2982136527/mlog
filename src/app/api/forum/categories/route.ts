import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { listForumCategories } from '@/lib/forum/service'

export async function GET() {
  const requestId = createRequestId()
  try {
    const items = await listForumCategories()
    return ok(requestId, { items })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[forum][categories][GET]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to load forum categories.')
  }
}
