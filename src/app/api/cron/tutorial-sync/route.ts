import { NextRequest } from 'next/server'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { runTutorialSync } from '@/lib/tutorial/sync-service'

function requireCronAuth(request: NextRequest) {
  const expected = (process.env.CRON_SECRET || '').trim()
  if (!expected) {
    throw new AdminHttpError(500, 'CRON_SECRET_MISSING', 'CRON_SECRET is not configured.')
  }

  const authHeader = request.headers.get('authorization') || ''
  if (authHeader !== `Bearer ${expected}`) {
    throw new AdminHttpError(401, 'UNAUTHORIZED', 'Invalid cron authorization header.')
  }
}

function isTutorialSyncEnabled(): boolean {
  const raw = (process.env.TUTORIAL_SYNC_ENABLED || 'true').trim().toLowerCase()
  return !['0', 'false', 'off', 'no'].includes(raw)
}

async function handle(request: NextRequest) {
  const requestId = createRequestId()

  try {
    requireCronAuth(request)

    if (!isTutorialSyncEnabled()) {
      return ok(requestId, {
        result: {
          status: 'SKIPPED_DISABLED'
        }
      })
    }

    const result = await runTutorialSync({
      actor: 'system',
      requestId,
      force: false
    })

    console.info('[cron][tutorial-sync]', {
      requestId,
      status: result.status,
      sourceHash: result.sourceHash,
      prUrl: result.publicMirrorPublish?.prUrl,
      deployTriggered: result.deploy?.triggered,
      deploySuccess: result.deploy?.success,
      deployStatus: result.deploy?.status
    })

    return ok(requestId, {
      result
    })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }

    console.error('[cron][tutorial-sync]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to run tutorial sync cron')
  }
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
