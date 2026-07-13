import type { DailyBlogLastRunState, DailyBlogRunResult } from '@/types/automation'
import { getAdminGithubEnv } from '@/lib/admin/env'
import { AdminHttpError } from '@/lib/admin/errors'
import { encodeTextBase64, getRepoTextFile, upsertFile } from '@/lib/admin/github-client'

const LAST_RUN_PATH = 'content/system/automation/daily-blog-last-run.json'

export async function saveDailyBlogLastRun(input: {
  requestId: string
  actor: string
  result: DailyBlogRunResult
}): Promise<void> {
  const env = getAdminGithubEnv()
  const state: DailyBlogLastRunState = {
    requestId: input.requestId,
    actor: input.actor,
    runAt: new Date().toISOString(),
    result: input.result
  }
  const existing = await getRepoTextFile(LAST_RUN_PATH, env.baseBranch, env)

  await upsertFile({
    path: LAST_RUN_PATH,
    contentBase64: encodeTextBase64(`${JSON.stringify(state, null, 2)}\n`),
    message: `Save daily-blog last run (${input.requestId})`,
    branch: env.baseBranch,
    sha: existing?.sha
  }, env)
}

export async function loadDailyBlogLastRun(): Promise<DailyBlogLastRunState | null> {
  const env = getAdminGithubEnv()
  const result = await getRepoTextFile(LAST_RUN_PATH, env.baseBranch, env)
  if (!result) {
    return null
  }

  try {
    return JSON.parse(result.content) as DailyBlogLastRunState
  } catch (error) {
    throw new AdminHttpError(
      500,
      'INVALID_AUTOMATION_LAST_RUN',
      error instanceof Error ? error.message : 'Invalid daily-blog last run JSON.'
    )
  }
}
