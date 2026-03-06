import { NextRequest } from 'next/server'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { getForumThreadDetail } from '@/lib/forum/service'

function parseThreadNumber(value: string): number {
  const number = Number.parseInt(value, 10)
  if (!Number.isFinite(number) || number <= 0) {
    throw new AdminHttpError(400, 'FORUM_INVALID_INPUT', 'Invalid thread number.')
  }
  return number
}

type ThreadRouteProps = {
  params: Promise<{
    number: string
  }>
}

export async function GET(request: NextRequest, { params }: ThreadRouteProps) {
  const requestId = createRequestId()
  try {
    const { number: rawNumber } = await params
    const number = parseThreadNumber(rawNumber)
    const { searchParams } = new URL(request.url)
    const cursor = searchParams.get('cursor') || undefined
    const payload = await getForumThreadDetail({
      number,
      cursor
    })
    return ok(requestId, payload)
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[forum][thread][GET]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to load forum thread detail.')
  }
}
