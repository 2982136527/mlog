import { NextRequest, NextResponse } from 'next/server'
import { getLiveCardForPost, LIVE_CARD_CACHE_TTL_SECONDS, LiveCardHttpError } from '@/lib/blog/live-card'

export const runtime = 'nodejs'

function createRequestId(): string {
  return crypto.randomUUID()
}

function buildErrorResponse(input: {
  requestId: string
  status: number
  code: string
  message: string
}): NextResponse {
  return NextResponse.json(
    {
      requestId: input.requestId,
      error: {
        code: input.code,
        message: input.message
      }
    },
    {
      status: input.status,
      headers: {
        'Cache-Control': 'no-store'
      }
    }
  )
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = createRequestId()
  const locale = request.nextUrl.searchParams.get('locale') || ''
  const slug = request.nextUrl.searchParams.get('slug') || ''

  try {
    const payload = await getLiveCardForPost({
      locale,
      slug
    })

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': `public, s-maxage=${LIVE_CARD_CACHE_TTL_SECONDS}, stale-while-revalidate=${LIVE_CARD_CACHE_TTL_SECONDS}`
      }
    })
  } catch (error) {
    if (error instanceof LiveCardHttpError) {
      return buildErrorResponse({
        requestId,
        status: error.status,
        code: error.code,
        message: error.message
      })
    }

    console.error('[api][blog][live-card]', requestId, error)
    return buildErrorResponse({
      requestId,
      status: 503,
      code: 'GITHUB_UPSTREAM_FAILED',
      message: 'GitHub upstream request failed.'
    })
  }
}
