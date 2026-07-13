import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { AdminHttpError } from '@/lib/admin/errors'
import { fail } from '@/lib/admin/response'
import { MediaError } from './errors'

const MAX_MULTIPART_REQUEST_BYTES = Math.floor(4.4 * 1024 * 1024)
const MAX_MEDIA_FILE_BYTES = 4 * 1024 * 1024

export function assertMediaRequestSize(request: NextRequest): void {
  const value = request.headers.get('content-length')
  if (!value) return
  const length = Number(value)
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new MediaError({
      status: 400,
      code: 'MEDIA_INVALID_INPUT',
      message: 'Invalid Content-Length header.'
    })
  }
  if (length > MAX_MULTIPART_REQUEST_BYTES) {
    throw new MediaError({
      status: 413,
      code: 'MEDIA_FILE_TOO_LARGE',
      message: 'The media upload request exceeds the 4.4MB Vercel request limit.'
    })
  }
}

export function getMediaClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-vercel-forwarded-for')
    || request.headers.get('x-forwarded-for')
    || request.headers.get('x-real-ip')
  const candidate = forwarded?.split(',', 1)[0].trim()
  if (candidate) return candidate
  return process.env.NODE_ENV === 'production' ? '' : '127.0.0.1'
}

export function requireMediaFile(value: FormDataEntryValue | null): File {
  if (!(value instanceof File)) {
    throw new MediaError({
      status: 400,
      code: 'MEDIA_INVALID_INPUT',
      message: 'File is required (multipart/form-data with a file field).'
    })
  }
  if (value.size < 1) {
    throw new MediaError({
      status: 400,
      code: 'MEDIA_INVALID_INPUT',
      message: 'The uploaded image is empty.'
    })
  }
  if (value.size > MAX_MEDIA_FILE_BYTES) {
    throw new MediaError({
      status: 413,
      code: 'MEDIA_FILE_TOO_LARGE',
      message: 'The uploaded image exceeds the 4MB input limit.'
    })
  }
  return value
}

export function mediaFailure(requestId: string, error: unknown, fallbackMessage: string): NextResponse {
  if (error instanceof MediaError) {
    const response = fail(requestId, error.status, error.code, error.message, {
      retryable: error.retryable,
      ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {})
    })
    if (error.retryAfterSeconds) {
      response.headers.set('Retry-After', String(error.retryAfterSeconds))
    }
    return response
  }
  if (error instanceof AdminHttpError) {
    return fail(requestId, error.status, error.code, error.message, error.extra)
  }
  return fail(requestId, 500, 'INTERNAL_ERROR', fallbackMessage)
}

export function validateMediaId(value: string): string {
  const id = value.trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(id)) {
    throw new MediaError({
      status: 400,
      code: 'MEDIA_INVALID_INPUT',
      message: 'Invalid media ID.'
    })
  }
  return id
}
