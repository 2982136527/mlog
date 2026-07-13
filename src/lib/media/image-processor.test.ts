import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { DEFAULT_MEDIA_LIMITS } from './config'
import { MediaError } from './errors'
import { detectMediaMimeType, processMediaImage } from './image-processor'

async function makePng(width = 4, height = 3): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 20, g: 80, b: 140, alpha: 0.8 }
    }
  }).png().toBuffer()
}

describe('processMediaImage', () => {
  it('detects and fully decodes a supported image', async () => {
    const input = await makePng()
    const result = await processMediaImage({ buffer: input, declaredMimeType: 'image/png' })

    expect(detectMediaMimeType(input)).toBe('image/png')
    expect(result).toMatchObject({
      mimeType: 'image/png',
      extension: 'png',
      width: 4,
      height: 3,
      frames: 1
    })
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/)
    await expect(sharp(result.buffer).raw().toBuffer()).resolves.toHaveLength(4 * 3 * 4)
  })

  it('auto-rotates JPEGs and strips EXIF including GPS metadata', async () => {
    const input = await sharp({
      create: {
        width: 2,
        height: 3,
        channels: 3,
        background: { r: 200, g: 20, b: 40 }
      }
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .withExif({
        IFD0: { Copyright: 'private metadata' },
        IFD3: { GPSLatitude: '31/1 12/1 0/1', GPSLongitude: '121/1 30/1 0/1' }
      })
      .toBuffer()

    const result = await processMediaImage({ buffer: input, declaredMimeType: 'image/jpeg' })
    const metadata = await sharp(result.buffer).metadata()

    expect(result).toMatchObject({ width: 3, height: 2, mimeType: 'image/jpeg' })
    expect(metadata.orientation).toBeUndefined()
    expect(metadata.exif).toBeUndefined()
    expect(result.buffer.includes(Buffer.from('private metadata'))).toBe(false)
  })

  it('rejects a declared MIME mismatch before storage', async () => {
    const input = await makePng()
    await expect(processMediaImage({ buffer: input, declaredMimeType: 'image/jpeg' }))
      .rejects.toMatchObject({ code: 'MEDIA_TYPE_MISMATCH', status: 400 })
  })

  it('rejects signature-only garbage that cannot be decoded', async () => {
    const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02])
    await expect(processMediaImage({ buffer: fakeJpeg, declaredMimeType: 'image/jpeg' }))
      .rejects.toMatchObject({ code: 'MEDIA_IMAGE_INVALID' })
  })

  it('enforces file and decoded pixel budgets', async () => {
    const input = await makePng(5, 5)
    await expect(processMediaImage({
      buffer: input,
      declaredMimeType: 'image/png',
      limits: { ...DEFAULT_MEDIA_LIMITS, maxInputBytes: input.length - 1 }
    })).rejects.toMatchObject({ code: 'MEDIA_FILE_TOO_LARGE', status: 413 })

    await expect(processMediaImage({
      buffer: input,
      declaredMimeType: 'image/png',
      limits: { ...DEFAULT_MEDIA_LIMITS, maxPixelsPerFrame: 24 }
    })).rejects.toMatchObject({ code: 'MEDIA_DIMENSIONS_EXCEEDED', status: 413 })
  })

  it('enforces animated frame budgets before normalizing the image', async () => {
    const first = await sharp({
      create: { width: 2, height: 2, channels: 4, background: 'red' }
    }).png().toBuffer()
    const second = await sharp({
      create: { width: 2, height: 2, channels: 4, background: 'blue' }
    }).png().toBuffer()
    const gif = await sharp([first, second], { join: { animated: true } })
      .gif({ delay: [100, 100], loop: 0 })
      .toBuffer()

    await expect(processMediaImage({
      buffer: gif,
      declaredMimeType: 'image/gif',
      limits: { ...DEFAULT_MEDIA_LIMITS, maxFrames: 1 }
    })).rejects.toMatchObject({ code: 'MEDIA_FRAME_LIMIT_EXCEEDED', status: 413 })
  })

  it('produces deterministic content hashes for identical normalized input', async () => {
    const input = await makePng()
    const first = await processMediaImage({ buffer: input, declaredMimeType: 'image/png' })
    const second = await processMediaImage({ buffer: input, declaredMimeType: 'image/png' })

    expect(second.sha256).toBe(first.sha256)
    expect(second.buffer.equals(first.buffer)).toBe(true)
  })

  it('rejects unsupported formats without invoking format fallback', async () => {
    await expect(processMediaImage({
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      declaredMimeType: 'image/svg+xml'
    })).rejects.toBeInstanceOf(MediaError)
  })
})
