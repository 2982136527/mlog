import 'server-only'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { visit } from 'unist-util-visit'
import type { Definition, Image, ImageReference, Root } from 'mdast'
import type { AdminPostPayload } from '@/types/admin'
import { AdminHttpError } from '@/lib/admin/errors'
import { normalizeMediaPathPrefix } from './config'
import { MediaError } from './errors'
import { isAllowedPublicMediaUrl } from './public-url'
import { getMediaById, type StoredMediaAsset } from './repository'

const MANAGED_FILE_RE = /^([a-f0-9]{2})\/([a-f0-9]{64})\.(?:jpg|png|webp|gif)$/

type PublicationImage = {
  locale: string
  field: 'cover' | 'markdown'
  url: string
}

function normalizeAbsoluteUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}

export function managedMediaIdFromUrl(value: string): string | null {
  if (!isAllowedPublicMediaUrl(value) || value.trim().startsWith('/')) return null
  let pathname: string
  try {
    pathname = new URL(value).pathname
  } catch {
    return null
  }
  const prefix = normalizeMediaPathPrefix(process.env.IMAGE_GITHUB_PATH_PREFIX)
  const marker = `/${prefix}/`
  const index = pathname.lastIndexOf(marker)
  if (index < 0) return null
  const match = pathname.slice(index + marker.length).match(MANAGED_FILE_RE)
  if (!match || match[1] !== match[2].slice(0, 2)) return null
  return match[2]
}

function markdownImages(markdown: string, locale: string): PublicationImage[] {
  const tree = unified().use(remarkParse).parse(markdown) as Root
  const definitions = new Map<string, string>()
  const images: PublicationImage[] = []

  visit(tree, 'definition', node => {
    const definition = node as Definition
    definitions.set(definition.identifier.toLowerCase(), definition.url)
  })
  visit(tree, 'image', node => {
    images.push({ locale, field: 'markdown', url: (node as Image).url })
  })
  visit(tree, 'imageReference', node => {
    const reference = node as ImageReference
    const url = definitions.get(reference.identifier.toLowerCase())
    if (url) images.push({ locale, field: 'markdown', url })
  })
  return images
}

export function collectPublicationImages(changes: Array<Pick<AdminPostPayload, 'locale' | 'frontmatter' | 'markdown'>>): PublicationImage[] {
  return changes.flatMap(change => [
    ...(change.frontmatter.cover
      ? [{ locale: change.locale, field: 'cover' as const, url: change.frontmatter.cover }]
      : []),
    ...markdownImages(change.markdown, change.locale)
  ])
}

function canonicalUrl(value: string): string {
  const url = new URL(value)
  url.hash = ''
  return url.toString()
}

function assertReadyAsset(image: PublicationImage, asset: StoredMediaAsset | null): void {
  if (!asset || asset.status !== 'ready' || asset.deletedAt || !asset.url) {
    throw new AdminHttpError(
      409,
      'MEDIA_NOT_READY',
      `${image.locale.toUpperCase()} ${image.field} references media that is not ready.`
    )
  }
  if (canonicalUrl(asset.url) !== canonicalUrl(image.url)) {
    throw new AdminHttpError(
      409,
      'MEDIA_URL_NOT_READY',
      `${image.locale.toUpperCase()} ${image.field} must use the verified media URL returned by the upload API.`
    )
  }
}

export async function assertPublicationMediaReady(
  changes: Array<Pick<AdminPostPayload, 'locale' | 'frontmatter' | 'markdown'>>
): Promise<void> {
  const images = collectPublicationImages(changes)
  const assets = new Map<string, Promise<StoredMediaAsset | null>>()

  for (const image of images) {
    const value = image.url.trim()
    if (value.startsWith('/images/')) continue

    if (!isAllowedPublicMediaUrl(value)) {
      if (image.field === 'cover' || !normalizeAbsoluteUrl(value)) {
        throw new AdminHttpError(
          400,
          'INVALID_MEDIA_URL',
          `${image.locale.toUpperCase()} ${image.field} must use /images, the configured media service, or an external HTTPS image.`
        )
      }
      continue
    }

    const id = managedMediaIdFromUrl(value)
    if (!id) {
      throw new AdminHttpError(
        400,
        'INVALID_MEDIA_URL',
        `${image.locale.toUpperCase()} ${image.field} uses the media host outside the managed content-addressed namespace.`
      )
    }

    try {
      let assetPromise = assets.get(id)
      if (!assetPromise) {
        assetPromise = getMediaById(id, true)
        assets.set(id, assetPromise)
      }
      assertReadyAsset(image, await assetPromise)
    } catch (error) {
      if (error instanceof AdminHttpError) throw error
      if (error instanceof MediaError) {
        throw new AdminHttpError(503, 'MEDIA_READY_CHECK_UNAVAILABLE', error.message)
      }
      throw error
    }
  }
}
