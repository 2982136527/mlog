import { NextRequest } from 'next/server'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { checkAndRotateShard } from '@/lib/admin/shard-rotation'

export const runtime = 'nodejs'
export const maxDuration = 60

function requireCronAuth(request: NextRequest) {
  const expected = (process.env.CRON_SECRET || '').trim()
  if (!expected) {
    throw new AdminHttpError(500, 'CRON_SECRET_MISSING', 'CRON_SECRET is not configured.')
  }

  const authHeader = request.headers.get('authorization') || ''
  const expectedHeader = `Bearer ${expected}`
  if (authHeader !== expectedHeader) {
    throw new AdminHttpError(401, 'UNAUTHORIZED', 'Invalid cron authorization header.')
  }
}

export async function GET(request: NextRequest) {
  const requestId = createRequestId()

  try {
    requireCronAuth(request)

    const result = await checkAndRotateShard()

    console.info('[cron][shard-check]', {
      requestId,
      rotated: result.rotated,
      newShard: result.newShard?.repo
    })

    return ok(requestId, {
      rotated: result.rotated,
      newShard: result.newShard ? { id: result.newShard.id, repo: result.newShard.repo } : null
    })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }

    console.error('[cron][shard-check]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to run shard check cron')
  }
}
