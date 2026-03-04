import { requireAdminSession } from '@/lib/admin/session'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { previewGithubHotCandidates } from '@/lib/automation/github-hot/service'

export async function GET() {
  const requestId = createRequestId()

  try {
    await requireAdminSession()
    const preview = await previewGithubHotCandidates()

    return ok(requestId, {
      preview
    })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }

    console.error('[admin][automation][github-hot-daily][candidates][GET]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to preview github hot candidates')
  }
}
