import 'server-only'
import path from 'node:path'
import type { MediaConfig } from './config'
import { MediaError } from './errors'
import { processMediaImage } from './image-processor'
import type { MediaRateLimiter } from './rate-limit'
import type { MediaStorage } from './storage'
import type { MediaAsset, MediaAvailability, MediaUploadInput } from './types'

type ReservedUploadInput = Omit<MediaUploadInput, 'actor' | 'ip'>

export type ReservedMediaUpload = {
  reserveBytes(bytes: number): Promise<void>
  upload(input: ReservedUploadInput): Promise<MediaAsset>
}

function markdownAlt(input: string): string {
  return input
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .trim()
    .slice(0, 200)
}

function defaultAlt(originalName: string): string {
  const base = path.basename(originalName).replace(/\.[^.]+$/, '')
  return markdownAlt(base) || 'image'
}

export class MediaUploadService {
  constructor(
    private readonly config: MediaConfig,
    private readonly storage: MediaStorage,
    private readonly rateLimiter: MediaRateLimiter
  ) {}

  async upload(input: MediaUploadInput): Promise<MediaAsset> {
    const reservation = await this.reserve({ actor: input.actor, ip: input.ip })
    return reservation.upload(input)
  }

  async reserve(input: Pick<MediaUploadInput, 'actor' | 'ip'>): Promise<ReservedMediaUpload> {
    await this.rateLimiter.consume(input)
    let used = false
    let reservedBytes: number | null = null
    return {
      reserveBytes: async bytes => {
        if (used || reservedBytes !== null || !Number.isSafeInteger(bytes) || bytes < 1) {
          throw new MediaError({
            status: 400,
            code: 'MEDIA_INVALID_INPUT',
            message: 'A valid upload size can only be reserved once.'
          })
        }
        if (this.rateLimiter.consumeBytes) {
          await this.rateLimiter.consumeBytes({ actor: input.actor, bytes })
        }
        reservedBytes = bytes
      },
      upload: async payload => {
        if (used) {
          throw new MediaError({
            status: 409,
            code: 'MEDIA_INVALID_INPUT',
            message: 'A media upload reservation can only be used once.'
          })
        }
        used = true
        if (reservedBytes !== null && reservedBytes !== payload.buffer.length) {
          throw new MediaError({
            status: 400,
            code: 'MEDIA_INVALID_INPUT',
            message: 'Reserved upload size does not match the received media bytes.'
          })
        }
        if (reservedBytes === null && this.rateLimiter.consumeBytes) {
          await this.rateLimiter.consumeBytes({ actor: input.actor, bytes: payload.buffer.length })
        }
        return this.uploadReserved(payload)
      }
    }
  }

  private async uploadReserved(input: ReservedUploadInput): Promise<MediaAsset> {
    if (!Buffer.isBuffer(input.buffer) || !input.requestId.trim() || input.requestId.length > 200) {
      throw new MediaError({
        status: 400,
        code: 'MEDIA_INVALID_INPUT',
        message: 'A media buffer and request ID are required.'
      })
    }

    const processed = await processMediaImage({
      buffer: input.buffer,
      declaredMimeType: input.declaredMimeType,
      limits: this.config.limits
    })
    const objectPath = `${this.config.pathPrefix}/${processed.sha256.slice(0, 2)}/${processed.sha256}.${processed.extension}`
    const stored = await this.storage.put({
      path: objectPath,
      buffer: processed.buffer,
      mimeType: processed.mimeType,
      sha256: processed.sha256,
      requestId: input.requestId
    })
    const candidates = this.storage.buildCandidates(objectPath)
    if (!candidates.length) {
      throw new MediaError({
        status: 500,
        code: 'MEDIA_CONFIG_INVALID',
        message: 'The media storage provider did not return a public URL candidate.'
      })
    }
    const availability = await this.storage.probe(objectPath, input.requestId)
    const url = availability.url || candidates[0].url
    const alt = markdownAlt(input.alt || '') || defaultAlt(input.originalName)

    return {
      id: processed.sha256,
      sha256: processed.sha256,
      path: stored.path,
      mimeType: processed.mimeType,
      size: processed.size,
      width: processed.width,
      height: processed.height,
      frames: processed.frames,
      provider: stored.provider,
      locator: {
        owner: this.config.github.owner,
        repo: this.config.github.repo,
        branch: this.config.github.branch,
        pathPrefix: this.config.pathPrefix
      },
      url,
      markdown: `![${alt}](${url})`,
      candidates,
      available: availability.available,
      created: stored.created,
      checkedAt: availability.checkedAt
    }
  }

  checkAvailability(path: string, requestId: string): Promise<MediaAvailability> {
    return this.storage.probe(path, requestId)
  }
}
