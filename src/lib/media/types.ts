export type MediaMimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

export type MediaCandidateKind = 'custom-cdn' | 'jsdelivr' | 'github-raw'

export type MediaCandidate = {
  kind: MediaCandidateKind
  url: string
}

export type MediaProviderLocator = {
  owner: string
  repo: string
  branch: string
  pathPrefix: string
}

export type MediaAvailability = {
  available: boolean
  checkedAt: string
  url?: string
  candidateKind?: MediaCandidateKind
}

export type ProcessedMedia = {
  buffer: Buffer
  sha256: string
  mimeType: MediaMimeType
  extension: 'jpg' | 'png' | 'webp' | 'gif'
  size: number
  width: number
  height: number
  frames: number
}

export type MediaAsset = {
  id: string
  sha256: string
  path: string
  mimeType: MediaMimeType
  size: number
  width: number
  height: number
  frames: number
  provider: 'github'
  locator: MediaProviderLocator
  url: string
  markdown: string
  candidates: MediaCandidate[]
  available: boolean
  created: boolean
  checkedAt: string
}

export type MediaUploadInput = {
  buffer: Buffer
  declaredMimeType: string
  originalName: string
  requestId: string
  actor: string
  ip: string
  alt?: string
}
