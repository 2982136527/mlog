import { requireAdminSession } from '@/lib/admin/session'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { runGithubHotDailyAutomation } from '@/lib/automation/github-hot/service'
import { saveGithubHotDailyLastRun } from '@/lib/automation/github-hot/run-state-store'

export async function POST() {
  const requestId = createRequestId()

  try {
    const { login } = await requireAdminSession()
    const result = await runGithubHotDailyAutomation({
      actor: login,
      requestId,
      bypassEnabled: true
    })

    try {
      await saveGithubHotDailyLastRun({
        requestId,
        actor: login,
        result
      })
    } catch (saveError) {
      console.error('[admin][automation][github-hot-daily][run][save-last-run]', requestId, saveError)
    }

    console.info('[admin][automation][github-hot-daily][run]', {
      requestId,
      actor: login,
      status: result.status,
      slug: result.slug,
      repo: result.selectedRepo?.fullName,
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

    console.error('[admin][automation][github-hot-daily][run]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to run automation')
  }
}
