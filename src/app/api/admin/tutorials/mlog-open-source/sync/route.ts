import { requireAdminSession } from '@/lib/admin/session'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { runTutorialSync } from '@/lib/tutorial/sync-service'

export async function POST() {
  const requestId = createRequestId()

  try {
    await requireAdminSession()
    const result = await runTutorialSync({
      actor: 'admin',
      requestId,
      force: false
    })

    console.info('[admin][tutorial][sync]', {
      requestId,
      status: result.status,
      sourceHash: result.sourceHash,
      updatedDateApplied: result.updatedDateApplied,
      updatedDateChanged: result.updatedDateChanged,
      docsPaths: result.docsPaths,
      prUrl: result.publicMirrorPublish?.prUrl
    })

    return ok(requestId, {
      result
    })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }

    console.error('[admin][tutorial][sync]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to sync tutorial mirror')
  }
}
