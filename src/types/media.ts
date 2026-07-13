export type AdminMediaStatus = 'processing' | 'ready' | 'failed' | 'deleted'

export type AdminMediaAsset = {
  id: string
  status: AdminMediaStatus
  filename: string
  alt: string
  mimeType: string
  size: number
  width: number | null
  height: number | null
  hash: string
  url: string | null
  markdown: string | null
  available: boolean
  duplicate: boolean
  createdAt: string
  checkedAt: string | null
}

export type AdminMediaPoll = {
  url: string
  afterMs: number
  expiresAt?: string
}

export type AdminMediaApiResponse = {
  requestId?: string
  success?: boolean
  status?: AdminMediaStatus | string
  available?: boolean
  url?: string | null
  markdown?: string | null
  duplicate?: boolean
  isDuplicate?: boolean
  media?: unknown
  image?: unknown
  links?: unknown
  poll?: Partial<AdminMediaPoll> | null
  error?: {
    code?: string
    message?: string
    retryable?: boolean
  }
}

export type AdminMediaListResponse = {
  requestId?: string
  items?: unknown[]
  media?: unknown[]
  images?: unknown[]
  nextCursor?: string | null
  hasMore?: boolean
  total?: number
  error?: {
    code?: string
    message?: string
  }
}
