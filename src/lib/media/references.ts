import 'server-only'
import fs from 'node:fs'
import path from 'node:path'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { visit } from 'unist-util-visit'
import type { Definition, Image, ImageReference, Root } from 'mdast'
import type { Locale } from '@/i18n/config'
import type { Post } from '@/types/content'
import { parsePostMatter } from '@/lib/content/frontmatter'
import { getRemoteContentSnapshotUncached } from '@/lib/content/remote-snapshot'
import { MediaError } from './errors'
import type { StoredMediaAsset } from './repository'

export type MediaReference = {
  slug: string
  locale: Locale
  field: 'markdown' | 'cover'
  draft: boolean
  source: string
}

export type MediaReferenceReport = {
  count: number
  scannedAt: string
  items: MediaReference[]
  truncated: boolean
}

const CONTENT_ROOT = path.join(process.cwd(), 'content', 'posts')
const MAX_REPORT_ITEMS = 200

function normalizeReference(value: string): string {
  const source = value.trim()
  if (!source) return ''

  try {
    const url = new URL(source)
    url.hash = ''
    url.search = ''
    return url.toString()
  } catch {
    return source.replace(/[?#].*$/, '')
  }
}

function aliasesForAsset(asset: StoredMediaAsset): Set<string> {
  const aliases = new Set<string>()
  for (const value of [asset.url, ...asset.candidates.map(candidate => candidate.url)]) {
    if (!value) continue
    const normalized = normalizeReference(value)
    if (normalized) aliases.add(normalized)
  }
  return aliases
}

function readLocalPosts(): Post[] {
  if (!fs.existsSync(CONTENT_ROOT)) return []
  const posts: Post[] = []

  for (const entry of fs.readdirSync(CONTENT_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-z0-9-]+$/.test(entry.name)) continue
    for (const locale of ['zh', 'en'] as const) {
      const filePath = path.join(CONTENT_ROOT, entry.name, `${locale}.md`)
      if (!fs.existsSync(filePath)) continue
      const parsed = parsePostMatter(fs.readFileSync(filePath, 'utf8'))
      posts.push({
        slug: entry.name,
        locale,
        frontmatter: parsed.data as Post['frontmatter'],
        content: parsed.content,
        readingTime: 0
      })
    }
  }

  return posts
}

async function loadAllPostsIncludingDrafts(): Promise<Post[]> {
  const remote = await getRemoteContentSnapshotUncached()
  return remote?.posts || readLocalPosts()
}

function appendMatch(
  reports: Map<string, MediaReference[]>,
  aliasOwners: Map<string, Set<string>>,
  value: string,
  reference: Omit<MediaReference, 'source'>
): void {
  const normalized = normalizeReference(value)
  if (!normalized) return
  const owners = aliasOwners.get(normalized)
  if (!owners) return

  for (const id of owners) {
    const items = reports.get(id) || []
    items.push({ ...reference, source: value })
    reports.set(id, items)
  }
}

export function scanPostsForMediaReferences(posts: Post[], assets: StoredMediaAsset[]): Map<string, MediaReference[]> {
  const reports = new Map<string, MediaReference[]>()
  const aliasOwners = new Map<string, Set<string>>()

  for (const asset of assets) {
    reports.set(asset.id, [])
    for (const alias of aliasesForAsset(asset)) {
      const owners = aliasOwners.get(alias) || new Set<string>()
      owners.add(asset.id)
      aliasOwners.set(alias, owners)
    }
  }

  for (const post of posts) {
    const base = {
      slug: post.slug,
      locale: post.locale,
      draft: Boolean(post.frontmatter.draft)
    }
    if (post.frontmatter.cover) {
      appendMatch(reports, aliasOwners, post.frontmatter.cover, { ...base, field: 'cover' })
    }

    const tree = unified().use(remarkParse).parse(post.content) as Root
    const definitions = new Map<string, string[]>()
    visit(tree, 'definition', node => {
      const definition = node as Definition
      const identifier = definition.identifier.toLowerCase()
      const urls = definitions.get(identifier) || []
      urls.push(definition.url)
      definitions.set(identifier, urls)
    })
    visit(tree, 'image', node => {
      appendMatch(reports, aliasOwners, (node as Image).url, { ...base, field: 'markdown' })
    })
    visit(tree, 'imageReference', node => {
      const reference = node as ImageReference
      for (const url of definitions.get(reference.identifier.toLowerCase()) || []) {
        appendMatch(reports, aliasOwners, url, { ...base, field: 'markdown' })
      }
    })
  }

  return reports
}

export async function scanMediaReferences(assets: StoredMediaAsset[]): Promise<Map<string, MediaReferenceReport>> {
  try {
    const posts = await loadAllPostsIncludingDrafts()
    const matches = scanPostsForMediaReferences(posts, assets)
    const scannedAt = new Date().toISOString()
    const reports = new Map<string, MediaReferenceReport>()

    for (const asset of assets) {
      const allItems = matches.get(asset.id) || []
      reports.set(asset.id, {
        count: allItems.length,
        scannedAt,
        items: allItems.slice(0, MAX_REPORT_ITEMS),
        truncated: allItems.length > MAX_REPORT_ITEMS
      })
    }
    return reports
  } catch (error) {
    throw new MediaError({
      status: 503,
      code: 'MEDIA_REFERENCE_SCAN_UNAVAILABLE',
      message: `Media reference scan is unavailable: ${error instanceof Error ? error.message : 'unknown error'}`,
      retryable: true
    })
  }
}

export async function getMediaReferences(asset: StoredMediaAsset): Promise<MediaReferenceReport> {
  const reports = await scanMediaReferences([asset])
  return reports.get(asset.id) || {
    count: 0,
    scannedAt: new Date().toISOString(),
    items: [],
    truncated: false
  }
}
