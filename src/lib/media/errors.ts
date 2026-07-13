export type MediaErrorCode =
  | 'MEDIA_CONFIG_INVALID'
  | 'MEDIA_INVALID_INPUT'
  | 'MEDIA_TYPE_UNSUPPORTED'
  | 'MEDIA_TYPE_MISMATCH'
  | 'MEDIA_FILE_TOO_LARGE'
  | 'MEDIA_IMAGE_INVALID'
  | 'MEDIA_DIMENSIONS_EXCEEDED'
  | 'MEDIA_FRAME_LIMIT_EXCEEDED'
  | 'MEDIA_OUTPUT_TOO_LARGE'
  | 'MEDIA_STORAGE_CONFLICT'
  | 'MEDIA_STORAGE_UNAVAILABLE'
  | 'MEDIA_RATE_LIMITED'
  | 'MEDIA_RATE_LIMIT_UNAVAILABLE'
  | 'MEDIA_NOT_FOUND'
  | 'MEDIA_IN_USE'
  | 'MEDIA_PURGE_NOT_ALLOWED'
  | 'MEDIA_REFERENCE_SCAN_UNAVAILABLE'
  | 'MEDIA_REPOSITORY_CAPACITY_EXCEEDED'
  | 'MEDIA_DAILY_QUOTA_EXCEEDED'

export class MediaError extends Error {
  readonly status: number
  readonly code: MediaErrorCode
  readonly retryable: boolean
  readonly retryAfterSeconds?: number

  constructor(input: {
    status: number
    code: MediaErrorCode
    message: string
    retryable?: boolean
    retryAfterSeconds?: number
  }) {
    super(input.message)
    this.name = 'MediaError'
    this.status = input.status
    this.code = input.code
    this.retryable = input.retryable ?? false
    this.retryAfterSeconds = input.retryAfterSeconds
  }
}

export function mediaConfigError(message: string): MediaError {
  return new MediaError({
    status: 500,
    code: 'MEDIA_CONFIG_INVALID',
    message
  })
}
