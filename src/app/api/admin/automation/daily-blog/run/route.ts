import { requireAdminSession } from '@/lib/admin/session'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { runDailyBlogAutomation } from '@/lib/automation/daily-blog/service'
import { saveDailyBlogLastRun } from '@/lib/automation/daily-blog/run-state-store'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST() {
  const requestId = createRequestId()

  try {
    const { login } = await requireAdminSession()
    const result = await runDailyBlogAutomation({
      actor: login,
      requestId,
      bypassEnabled: true,
      triggerSource: 'admin_manual'
    })

    await saveDailyBlogLastRun({ requestId, actor: login, result }).catch(error => {
      console.error('[admin][automation][daily-blog][run][save-last-run]', requestId, error)
    })

    return ok(requestId, { result }, { status: result.status === 'PENDING_REVIEW' ? 202 : 200 })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[admin][automation][daily-blog][run]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to run daily blog automation.')
  }
}
