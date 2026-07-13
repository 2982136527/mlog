import { NextRequest } from 'next/server'
import { requireAdminSession } from '@/lib/admin/session'
import { createRequestId, ok } from '@/lib/admin/response'
import { MediaError } from '@/lib/media/errors'
import { mediaFailure, validateMediaId } from '@/lib/media/http'
import { getMediaById, restoreMedia, toMediaDto } from '@/lib/media/repository'

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = createRequestId()
  try {
    await requireAdminSession()
    const id = validateMediaId((await params).id)
    let asset = await restoreMedia(id)
    if (!asset) {
      const existing = await getMediaById(id, true)
      if (existing?.deletedAt) {
        throw new MediaError({
          status: 409,
          code: 'MEDIA_PURGE_NOT_ALLOWED',
          message: 'This media asset is claimed for current-branch removal and cannot be restored. Retry the removal to reconcile its state.'
        })
      }
      if (existing) asset = existing
    }
    if (!asset) {
      throw new MediaError({ status: 404, code: 'MEDIA_NOT_FOUND', message: 'Deleted media asset not found.' })
    }
    return ok(requestId, { success: true, media: toMediaDto(asset) })
  } catch (error) {
    console.error('[admin][media][restore][POST]', { requestId, error: error instanceof Error ? error.message : error })
    return mediaFailure(requestId, error, 'Failed to restore media.')
  }
}

export const dynamic = 'force-dynamic'
