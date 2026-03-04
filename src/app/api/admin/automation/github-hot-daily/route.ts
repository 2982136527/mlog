import { NextRequest } from 'next/server'
import { requireAdminSession } from '@/lib/admin/session'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { loadGithubHotDailyConfig, saveGithubHotDailyConfig } from '@/lib/automation/github-hot/config-store'
import { parseGithubHotDailyConfigUpdate } from '@/lib/automation/github-hot/config'

export async function GET() {
  const requestId = createRequestId()

  try {
    await requireAdminSession()
    const loaded = await loadGithubHotDailyConfig()
    return ok(requestId, {
      config: loaded.config
    })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }

    console.error('[admin][automation][github-hot-daily][GET]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to load automation config')
  }
}

export async function PUT(request: NextRequest) {
  const requestId = createRequestId()

  try {
    const { login } = await requireAdminSession()
    const payload = await request.json()
    const update = parseGithubHotDailyConfigUpdate(payload)
    const loaded = await loadGithubHotDailyConfig()
    const nextConfig = {
      ...loaded.config,
      enabled: update.enabled,
      topicKeywords: update.topicKeywords,
      updatedAt: new Date().toISOString(),
      updatedBy: login
    }

    const saved = await saveGithubHotDailyConfig({
      config: nextConfig,
      actor: login,
      requestId
    })

    console.info('[admin][automation][github-hot-daily][PUT]', {
      requestId,
      actor: login,
      enabled: saved.config.enabled,
      topicKeywords: saved.config.topicKeywords,
      changed: saved.changed,
      prUrl: saved.publish?.prUrl,
      merged: saved.publish?.merged
    })

    return ok(requestId, {
      config: saved.config,
      changed: saved.changed,
      publish: saved.publish
    })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }

    console.error('[admin][automation][github-hot-daily][PUT]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to update automation config')
  }
}

