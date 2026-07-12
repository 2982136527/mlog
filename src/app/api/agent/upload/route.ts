import { NextRequest } from 'next/server'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { validateAgentRequest } from '@/lib/agent/auth'
import { uploadMedia } from '@/lib/admin/publish-service'

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
const MAX_FILE_SIZE = 5 * 1024 * 1024

export async function POST(request: NextRequest) {
  const requestId = createRequestId()

  try {
    const userLogin = await validateAgentRequest(request)
    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      throw new AdminHttpError(400, 'INVALID_FILE', 'File is required (multipart/form-data with `file` field).')
    }

    if (file.size <= 0) {
      throw new AdminHttpError(400, 'INVALID_FILE', 'File cannot be empty.')
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new AdminHttpError(400, 'FILE_TOO_LARGE', 'File exceeds 5MB limit.')
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      throw new AdminHttpError(400, 'INVALID_MEDIA_TYPE', `Unsupported file type: ${file.type}. Allowed: jpg, png, gif, webp, svg.`)
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    const result = await uploadMedia({
      buffer,
      mimeType: file.type,
      originalName: file.name,
      actor: userLogin,
      requestId
    })

    console.info('[agent][upload][POST]', {
      requestId,
      actor: userLogin,
      url: result.url,
      prUrl: result.result.prUrl,
      merged: result.result.merged
    })

    return ok(requestId, {
      success: true,
      url: result.url
    })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[agent][upload][POST]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to upload image.')
  }
}

export const dynamic = 'force-dynamic'
