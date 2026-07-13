import { NextRequest } from 'next/server'
import { requireAdminSession } from '@/lib/admin/session'
import { createRequestId, ok } from '@/lib/admin/response'
import { mediaFailure, validateMediaId } from '@/lib/media/http'
import { getMediaReferences } from '@/lib/media/references'
import { softDeleteMedia, toMediaDto } from '@/lib/media/repository'
import { refreshMediaStatus } from '@/lib/media/status'
import { MediaError } from '@/lib/media/errors'
import { mediaPoll } from '@/lib/media/poll'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  const requestId = createRequestId()
  try {
    await requireAdminSession()
    const id = validateMediaId((await context.params).id)
    const asset = await refreshMediaStatus(id, requestId)
    const media = toMediaDto(asset)
    const includeReferences = request.nextUrl.searchParams.get('references') === '1'
    const references = includeReferences ? await getMediaReferences(asset) : undefined

    return ok(requestId, {
      success: media.status === 'ready',
      status: media.status,
      available: media.availability.available,
      url: media.url,
      markdown: media.markdown,
      media,
      ...(references ? { references } : {}),
      ...(media.status === 'processing' ? {
        poll: mediaPoll(asset, `/api/admin/media/${media.id}`)
      } : {})
    }, {
      status: media.status === 'processing' ? 202 : 200,
      headers: media.status === 'processing' ? { 'Retry-After': '2' } : undefined
    })
  } catch (error) {
    console.error('[admin][media][id][GET]', { requestId, error: error instanceof Error ? error.message : error })
    return mediaFailure(requestId, error, 'Failed to load media.')
  }
}

export async function DELETE(_: NextRequest, context: RouteContext) {
  const requestId = createRequestId()
  try {
    await requireAdminSession()
    const id = validateMediaId((await context.params).id)
    const asset = await softDeleteMedia(id)
    if (!asset) {
      throw new MediaError({ status: 404, code: 'MEDIA_NOT_FOUND', message: 'Media asset not found.' })
    }
    return ok(requestId, {
      success: true,
      media: toMediaDto(asset),
      message: 'Media was removed from the library; the public object remains available.'
    })
  } catch (error) {
    console.error('[admin][media][id][DELETE]', { requestId, error: error instanceof Error ? error.message : error })
    return mediaFailure(requestId, error, 'Failed to delete media.')
  }
}

export const dynamic = 'force-dynamic'
