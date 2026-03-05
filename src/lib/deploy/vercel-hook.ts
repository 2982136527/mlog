import type { DeployTriggerResult } from '@/types/admin'

const DEPLOY_TIMEOUT_MS = 10_000

function normalizeHookUrl(): string {
  return (process.env.VERCEL_DEPLOY_HOOK_URL || '').trim()
}

export async function triggerVercelDeployHook(input: {
  requestId: string
  reason: string
  changedPaths: string[]
}): Promise<DeployTriggerResult> {
  const hookUrl = normalizeHookUrl()
  if (!hookUrl) {
    return {
      triggered: false,
      success: false,
      message: 'VERCEL_DEPLOY_HOOK_URL is not configured.'
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEPLOY_TIMEOUT_MS)

  try {
    const response = await fetch(hookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'mlog-vercel-deploy-hook'
      },
      body: JSON.stringify({
        requestId: input.requestId,
        reason: input.reason,
        changedPaths: input.changedPaths
      }),
      signal: controller.signal,
      cache: 'no-store'
    })

    if (!response.ok) {
      const text = await response.text()
      return {
        triggered: true,
        success: false,
        status: response.status,
        message: text.slice(0, 300) || `Deploy hook request failed (${response.status})`
      }
    }

    return {
      triggered: true,
      success: true,
      status: response.status,
      message: 'Deploy triggered.'
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.name === 'AbortError'
          ? `Deploy hook timed out after ${DEPLOY_TIMEOUT_MS}ms.`
          : error.message
        : 'Deploy hook request failed.'

    return {
      triggered: true,
      success: false,
      message
    }
  } finally {
    clearTimeout(timeout)
  }
}
