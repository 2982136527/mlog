import { getAuthSession } from '@/lib/auth'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { getForumMe } from '@/lib/forum/service'

export async function GET() {
  const requestId = createRequestId()
  try {
    const session = await getAuthSession()
    const login = session?.user?.login?.trim()
    if (!login) {
      return fail(requestId, 401, 'UNAUTHORIZED', 'Authentication required.')
    }

    const payload = await getForumMe({
      login
    })
    return ok(requestId, payload)
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[forum][me][GET]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to load forum profile.')
  }
}
