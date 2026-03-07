import { requireAdminSession } from '@/lib/admin/session'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { runAiPaperDailyAutomation } from '@/lib/automation/ai-paper/service'
import { saveAiPaperDailyLastRun } from '@/lib/automation/ai-paper/run-state-store'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST() {
  const requestId = createRequestId()

  try {
    const { login } = await requireAdminSession()
    const result = await runAiPaperDailyAutomation({
      actor: login,
      requestId,
      bypassEnabled: true,
      triggerSource: 'admin_manual'
    })

    try {
      await saveAiPaperDailyLastRun({
        requestId,
        actor: login,
        result
      })
    } catch (saveError) {
      console.error('[admin][automation][ai-paper-daily][run][save-last-run]', requestId, saveError)
    }

    console.info('[admin][automation][ai-paper-daily][run]', {
      requestId,
      actor: login,
      status: result.status,
      slug: result.slug,
      arxivId: result.selectedPaper?.arxivId,
      prUrl: result.publish?.prUrl,
      merged: result.publish?.merged
    })

    return ok(requestId, {
      result
    })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }

    console.error('[admin][automation][ai-paper-daily][run]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to run automation')
  }
}
