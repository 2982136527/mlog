import { NextRequest } from 'next/server'
import { createRequestId, ok } from '@/lib/admin/response'
import { validateAgentRequest } from '@/lib/agent/auth'
import { getMediaUploadService } from '@/lib/media/factory'
import { assertMediaRequestSize, getMediaClientIp, mediaFailure, requireMediaFile } from '@/lib/media/http'
import { saveUploadedMedia, toMediaDto } from '@/lib/media/repository'
import { mediaPoll } from '@/lib/media/poll'

export async function POST(request: NextRequest) {
  const requestId = createRequestId()
  try {
    const { login } = await validateAgentRequest(request)
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
    const stored = await saveUploadedMedia({ asset, originalName: file.name, alt, uploaderLogin: login })
    const media = toMediaDto(stored, !asset.created)
    const ready = media.status === 'ready' && media.availability.available

    console.info('[agent][upload][POST]', {
      requestId,
      actor: login,
      mediaId: media.id,
      status: media.status,
      duplicate: media.duplicate
    })

    return ok(requestId, {
      accepted: true,
      success: ready,
      status: media.status,
      available: media.availability.available,
      url: media.url,
      markdown: media.markdown,
      media,
      ...(!ready ? {
        poll: mediaPoll(stored, `/api/agent/media/${media.id}`)
      } : {})
    }, {
      status: ready ? (asset.created ? 201 : 200) : 202,
      headers: ready ? undefined : { 'Retry-After': '2' }
    })
  } catch (error) {
    console.error('[agent][upload][POST]', { requestId, error: error instanceof Error ? error.message : error })
    return mediaFailure(requestId, error, 'Failed to upload media.')
  }
}

export const dynamic = 'force-dynamic'
