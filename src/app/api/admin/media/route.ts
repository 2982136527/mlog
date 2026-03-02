import { NextRequest } from 'next/server'
import { requireAdminSession } from '@/lib/admin/session'
import { uploadMedia } from '@/lib/admin/publish-service'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'

const MAX_FILE_SIZE = 5 * 1024 * 1024

export async function POST(request: NextRequest) {
  const requestId = createRequestId()

  try {
    const { login } = await requireAdminSession()
    const formData = await request.formData()
    const file = formData.get('file')
    const slugHint = String(formData.get('slug') || '').trim() || undefined

    if (!(file instanceof File)) {
      throw new AdminHttpError(400, 'INVALID_FILE', 'File is required')
    }

    if (file.size <= 0) {
      throw new AdminHttpError(400, 'INVALID_FILE', 'File cannot be empty')
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new AdminHttpError(400, 'FILE_TOO_LARGE', 'File exceeds 5MB limit')
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    const result = await uploadMedia({
      buffer,
      mimeType: file.type,
      originalName: file.name,
      slugHint,
      actor: login,
      requestId
    })

    console.info('[admin][media][POST]', {
      requestId,
      actor: login,
      path: result.path,
      prUrl: result.result.prUrl,
      merged: result.result.merged
    })

    return ok(requestId, {
      url: result.url,
      markdown: result.markdown,
      publish: result.result
    })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message)
    }

    console.error('[admin][media][POST]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to upload media')
  }
}
