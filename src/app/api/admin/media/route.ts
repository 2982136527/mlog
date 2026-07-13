import { NextRequest } from 'next/server'
import { requireAdminSession } from '@/lib/admin/session'
import { createRequestId, ok } from '@/lib/admin/response'
import { getMediaUploadService } from '@/lib/media/factory'
import { assertMediaRequestSize, getMediaClientIp, mediaFailure, requireMediaFile } from '@/lib/media/http'
import { listMediaAssets, saveUploadedMedia, toMediaDto, type MediaStatus } from '@/lib/media/repository'
import { mediaPoll } from '@/lib/media/poll'

export async function GET(request: NextRequest) {
  const requestId = createRequestId()
  try {
    await requireAdminSession()
    const statusValue = request.nextUrl.searchParams.get('status') || 'all'
    const status = ['processing', 'ready', 'failed', 'deleted', 'all'].includes(statusValue)
      ? statusValue as MediaStatus | 'all'
      : 'all'
    const result = await listMediaAssets({
      cursor: request.nextUrl.searchParams.get('cursor'),
      limit: Number(request.nextUrl.searchParams.get('limit') || 30),
      query: request.nextUrl.searchParams.get('q') || request.nextUrl.searchParams.get('query') || '',
      status
    })
    return ok(requestId, {
      items: result.items.map(asset => toMediaDto(asset)),
      media: result.items.map(asset => toMediaDto(asset)),
      nextCursor: result.nextCursor
    })
  } catch (error) {
    console.error('[admin][media][GET]', { requestId, error: error instanceof Error ? error.message : error })
    return mediaFailure(requestId, error, 'Failed to list media.')
  }
}

export async function POST(request: NextRequest) {
  const requestId = createRequestId()
  try {
    const { login } = await requireAdminSession()
    assertMediaRequestSize(request)
    const reservation = await getMediaUploadService().reserve({
      actor: login,
      ip: getMediaClientIp(request)
    })
    const formData = await request.formData()
    const file = requireMediaFile(formData.get('file'))
    await reservation.reserveBytes(file.size)
    const alt = typeof formData.get('alt') === 'string' ? String(formData.get('alt')).trim() : ''

    const asset = await reservation.upload({
      buffer: Buffer.from(await file.arrayBuffer()),
      declaredMimeType: file.type,
      originalName: file.name,
      requestId,
      alt
    })
    const stored = await saveUploadedMedia({
      asset,
      originalName: file.name,
      alt,
      uploaderLogin: login
    })
    const media = toMediaDto(stored, !asset.created)
    const ready = media.status === 'ready' && media.availability.available
    const statusCode = ready ? (asset.created ? 201 : 200) : 202

    console.info('[admin][media][POST]', {
      requestId,
      actor: login,
      mediaId: media.id,
      status: media.status,
      duplicate: media.duplicate
    })

    return ok(requestId, {
      success: ready,
      status: media.status,
      available: media.availability.available,
      url: media.url,
      markdown: media.markdown,
      media,
      ...(!ready ? {
        poll: mediaPoll(stored, `/api/admin/media/${media.id}`)
      } : {})
    }, {
      status: statusCode,
      headers: ready ? undefined : { 'Retry-After': '2' }
    })
  } catch (error) {
    console.error('[admin][media][POST]', { requestId, error: error instanceof Error ? error.message : error })
    return mediaFailure(requestId, error, 'Failed to upload media.')
  }
}

export const dynamic = 'force-dynamic'
