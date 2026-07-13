import { NextRequest } from 'next/server'
import { createRequestId, ok } from '@/lib/admin/response'
import { validateAgentRequest } from '@/lib/agent/auth'
import { mediaFailure, validateMediaId } from '@/lib/media/http'
import { toMediaDto } from '@/lib/media/repository'
import { refreshMediaStatus } from '@/lib/media/status'
import { mediaPoll } from '@/lib/media/poll'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = createRequestId()
  try {
    await validateAgentRequest(request)
    const id = validateMediaId((await params).id)
    const asset = await refreshMediaStatus(id, requestId)
    const media = toMediaDto(asset)
    return ok(requestId, {
      success: media.status === 'ready',
      status: media.status,
      available: media.availability.available,
      url: media.url,
      markdown: media.markdown,
      media,
      ...(media.status === 'processing' ? {
        poll: mediaPoll(asset, `/api/agent/media/${media.id}`)
      } : {})
    }, {
      status: media.status === 'processing' ? 202 : 200,
      headers: media.status === 'processing' ? { 'Retry-After': '2' } : undefined
    })
  } catch (error) {
    console.error('[agent][media][GET]', { requestId, error: error instanceof Error ? error.message : error })
    return mediaFailure(requestId, error, 'Failed to load media status.')
  }
}

export const dynamic = 'force-dynamic'
