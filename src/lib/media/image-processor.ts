import 'server-only'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { DEFAULT_MEDIA_LIMITS, type MediaImageLimits } from './config'
import { MediaError } from './errors'
import type { MediaMimeType, ProcessedMedia } from './types'

const EXTENSIONS: Record<MediaMimeType, ProcessedMedia['extension']> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
}

export function detectMediaMimeType(buffer: Buffer): MediaMimeType | null {
  if (
    buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png'
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }
  if (buffer.length >= 6) {
    const signature = buffer.subarray(0, 6).toString('ascii')
    if (signature === 'GIF87a' || signature === 'GIF89a') {
      return 'image/gif'
    }
  }
  if (
    buffer.length >= 12
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp'
  }
  return null
}

function normalizeDeclaredMimeType(input: string): MediaMimeType {
  const mimeType = input.split(';', 1)[0].trim().toLowerCase()
  if (!(mimeType in EXTENSIONS)) {
    throw new MediaError({
      status: 415,
      code: 'MEDIA_TYPE_UNSUPPORTED',
      message: 'Only JPEG, PNG, WebP, and GIF images are supported.'
    })
  }
  return mimeType as MediaMimeType
}

function assertDimensions(input: {
  width?: number
  height?: number
  pageHeight?: number
  pages?: number
}, limits: MediaImageLimits): { width: number; height: number; frames: number } {
  const width = input.width || 0
  const frames = input.pages || 1
  const frameHeight = input.pageHeight || (frames > 1 ? Math.floor((input.height || 0) / frames) : input.height) || 0

  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(frameHeight) || width < 1 || frameHeight < 1) {
    throw new MediaError({
      status: 400,
      code: 'MEDIA_IMAGE_INVALID',
      message: 'The uploaded file is not a decodable image.'
    })
  }
  if (!Number.isSafeInteger(frames) || frames < 1 || frames > limits.maxFrames) {
    throw new MediaError({
      status: 413,
      code: 'MEDIA_FRAME_LIMIT_EXCEEDED',
      message: `Animated images may contain at most ${limits.maxFrames} frames.`
    })
  }

  const pixelsPerFrame = width * frameHeight
  const totalPixels = pixelsPerFrame * frames
  if (
    width > limits.maxWidth
    || frameHeight > limits.maxHeight
    || pixelsPerFrame > limits.maxPixelsPerFrame
    || totalPixels > limits.maxTotalPixels
  ) {
    throw new MediaError({
      status: 413,
      code: 'MEDIA_DIMENSIONS_EXCEEDED',
      message: 'Image dimensions exceed the configured processing budget.'
    })
  }

  return { width, height: frameHeight, frames }
}

function buildPipeline(buffer: Buffer, mimeType: MediaMimeType, limits: MediaImageLimits) {
  const pipeline = sharp(buffer, {
    animated: true,
    failOn: 'error',
    limitInputPixels: limits.maxTotalPixels,
    sequentialRead: true
  }).rotate().timeout({ seconds: 10 })

  switch (mimeType) {
    case 'image/jpeg':
      return pipeline.jpeg({ quality: 82, mozjpeg: true, progressive: true })
    case 'image/png':
      return pipeline.png({ compressionLevel: 9, adaptiveFiltering: true })
    case 'image/webp':
      return pipeline.webp({ quality: 82, effort: 5, smartSubsample: true })
    case 'image/gif':
      return pipeline.gif({ effort: 7, reuse: true })
  }
}

export async function processMediaImage(input: {
  buffer: Buffer
  declaredMimeType: string
  limits?: MediaImageLimits
}): Promise<ProcessedMedia> {
  const limits = input.limits || DEFAULT_MEDIA_LIMITS
  if (!input.buffer.length) {
    throw new MediaError({
      status: 400,
      code: 'MEDIA_INVALID_INPUT',
      message: 'The uploaded image is empty.'
    })
  }
  if (input.buffer.length > limits.maxInputBytes) {
    throw new MediaError({
      status: 413,
      code: 'MEDIA_FILE_TOO_LARGE',
      message: `The uploaded image exceeds the ${limits.maxInputBytes} byte input limit.`
    })
  }

  const declaredMimeType = normalizeDeclaredMimeType(input.declaredMimeType)
  const detectedMimeType = detectMediaMimeType(input.buffer)
  if (!detectedMimeType) {
    throw new MediaError({
      status: 400,
      code: 'MEDIA_IMAGE_INVALID',
      message: 'The uploaded file does not have a supported image signature.'
    })
  }
  if (detectedMimeType !== declaredMimeType) {
    throw new MediaError({
      status: 400,
      code: 'MEDIA_TYPE_MISMATCH',
      message: 'The declared media type does not match the uploaded file.'
    })
  }

  try {
    const sourceMetadata = await sharp(input.buffer, {
      animated: true,
      failOn: 'error',
      limitInputPixels: limits.maxTotalPixels,
      sequentialRead: true
    }).metadata()
    assertDimensions(sourceMetadata, limits)

    // Sharp strips metadata unless withMetadata/keepMetadata is explicitly requested.
    const buffer = await buildPipeline(input.buffer, detectedMimeType, limits).toBuffer()
    if (buffer.length > limits.maxOutputBytes) {
      throw new MediaError({
        status: 413,
        code: 'MEDIA_OUTPUT_TOO_LARGE',
        message: `The normalized image exceeds the ${limits.maxOutputBytes} byte output limit.`
      })
    }

    // Decode the normalized output too; successful header parsing alone is not sufficient.
    const outputMetadata = await sharp(buffer, {
      animated: true,
      failOn: 'error',
      limitInputPixels: limits.maxTotalPixels,
      sequentialRead: true
    }).metadata()
    const dimensions = assertDimensions(outputMetadata, limits)
    await sharp(buffer, {
      animated: true,
      failOn: 'error',
      limitInputPixels: limits.maxTotalPixels,
      sequentialRead: true
    }).timeout({ seconds: 10 }).stats()

    return {
      buffer,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      mimeType: detectedMimeType,
      extension: EXTENSIONS[detectedMimeType],
      size: buffer.length,
      ...dimensions
    }
  } catch (error) {
    if (error instanceof MediaError) throw error
    throw new MediaError({
      status: 400,
      code: 'MEDIA_IMAGE_INVALID',
      message: 'The uploaded file could not be decoded safely.'
    })
  }
}
