import type { MediaAvailability, MediaCandidate, MediaMimeType } from './types'

export type PutMediaObjectInput = {
  path: string
  buffer: Buffer
  mimeType: MediaMimeType
  sha256: string
  requestId: string
}

export type StoredMediaObject = {
  path: string
  provider: 'github'
  created: boolean
  providerObjectId: string
}

export type DeleteMediaObjectInput = {
  path: string
  expectedSha256: string
  requestId: string
}

export type DeletedMediaObject = {
  path: string
  provider: 'github'
  deleted: boolean
}

export interface MediaStorage {
  readonly provider: 'github'
  put(input: PutMediaObjectInput): Promise<StoredMediaObject>
  delete(input: DeleteMediaObjectInput): Promise<DeletedMediaObject>
  buildCandidates(path: string): MediaCandidate[]
  probe(path: string, requestId: string): Promise<MediaAvailability>
}
