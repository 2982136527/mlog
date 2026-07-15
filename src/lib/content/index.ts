import fs from 'node:fs'
import path from 'node:path'
import readingTime from 'reading-time'
import { cache } from 'react'
import { defaultLocale, type Locale, locales, isLocale } from '@/i18n/config'
import type { LocalizedPost, Post, PostFrontmatter } from '@/types/content'
import type { RepoCardsConfig } from '@/types/repo-cards'
import { unique } from '@/lib/utils'
import { postFrontmatterSchema } from '@/lib/content/schema'
import { parsePostMatter } from '@/lib/content/frontmatter'
import { getRemoteContentSnapshot } from '@/lib/content/remote-snapshot'
import { buildDefaultRepoCardsConfig, getRepoCardsConfigFromLocal } from '@/lib/blog/repo-cards-config'

const CONTENT_ROOT = path.join(process.cwd(), 'content', 'posts')

export function isPublicPost(post: Post): boolean {
  return !post.frontmatter.draft
}

function ensureContentRootExists(): void {
  if (!fs.existsSync(CONTENT_ROOT)) {
    throw new Error(`Content directory not found: ${CONTENT_ROOT}`)
  }
}

function readMarkdownFile(filePath: string, locale: Locale, slug: string): Post {
  const raw = fs.readFileSync(filePath, 'utf8')
  const parsed = parsePostMatter(raw)
  const validated = postFrontmatterSchema.safeParse(parsed.data)

  if (!validated.success) {
    const issues = validated.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')
    throw new Error(`Invalid frontmatter in ${filePath} (${slug}/${locale}): ${issues}`)
  }

  return {
    slug,
    locale,
    frontmatter: validated.data as PostFrontmatter,
    content: parsed.content,
    readingTime: Math.max(1, Math.ceil(readingTime(parsed.content).minutes))
  }
}

function readAllLocalPosts(): Post[] {
  ensureContentRootExists()
  const posts: Post[] = []
  const slugDirs = fs
    .readdirSync(CONTENT_ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)

  for (const slug of slugDirs) {
    for (const locale of locales) {
      const filePath = path.join(CONTENT_ROOT, slug, `${locale}.md`)
      if (fs.existsSync(filePath)) {
        posts.push(readMarkdownFile(filePath, locale, slug))
      }
    }
  }
  return posts
}

const getAllLocalPosts = cache(readAllLocalPosts)

/**
 * Read posts from build-time snapshot file (public/__content__.json).
 * This file is created during build by save-content-snapshot.mjs
 * and is always available at runtime even when content/posts/ is not.
 */
function readPostsFromSnapshot(): Post[] | null {
  const snapshotPath = path.join(process.cwd(), 'public', '__content__.json')
  if (!fs.existsSync(snapshotPath)) return null

  const data = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
  if (!data || !Array.isArray(data.files)) return null

  const posts: Post[] = []
  for (const file of data.files) {
    const match = typeof file.p === 'string' ? file.p.match(/^([a-z0-9-]+)\/([a-z]+)\.md$/) : null
    if (!match) continue
    const locale = match[2] as Locale
    if (!isLocale(locale)) continue
    try {
      const raw = String(file.c || '')
      const parsed = parsePostMatter(raw)
      const validated = postFrontmatterSchema.safeParse(parsed.data)
      if (!validated.success) continue
      posts.push({
        slug: match[1],
        locale,
        frontmatter: validated.data as PostFrontmatter,
        content: parsed.content,
        readingTime: Math.max(1, Math.ceil(readingTime(parsed.content).minutes))
      })
    } catch {
      // skip invalid posts silently
    }
  }

  return posts.length > 0 ? posts : null
}

type PublicContentSnapshot = {
  posts: Post[]
  repoCardsBySlug: Record<string, RepoCardsConfig>
  remote: boolean
}

const getPublicContentSnapshot = cache(async (): Promise<PublicContentSnapshot> => {
  // 1. Try snapshot file first (public/__content__.json, always deployed with static assets)
  try {
    const snapPosts = readPostsFromSnapshot()
    if (snapPosts) {
      return { posts: snapPosts, repoCardsBySlug: {}, remote: false }
    }
  } catch { /* fall through */ }

  // 2. Try local content/posts/ directory (populated by content:pull at build time)
  try {
    const local = {
      posts: getAllLocalPosts(),
      repoCardsBySlug: {},
      remote: false
    }
    return local
  } catch { /* fall through */ }

  // 3. Fallback: fetch from GitHub (with unstable_cache)
  const remote = await getRemoteContentSnapshot()
  if (remote) {
    return { ...remote, remote: true }
  }

  // 4. Ultimate fallback: empty
  return { posts: [], repoCardsBySlug: {}, remote: false }
})

export async function getAllPostsAsync(): Promise<Post[]> {
  return (await getPublicContentSnapshot()).posts.filter(isPublicPost)
}

export async function getPostAsync(locale: Locale, slug: string): Promise<Post | null> {
  return (await getAllPostsAsync()).find(post => post.slug === slug && post.locale === locale) ?? null
}

export async function getLocalizedPostAsync(locale: Locale, slug: string): Promise<LocalizedPost | null> {
  const exact = await getPostAsync(locale, slug)
  if (exact) {
    return { ...exact, requestedLocale: locale, isFallback: false }
  }

  if (locale !== defaultLocale) {
    const fallback = await getPostAsync(defaultLocale, slug)
    if (fallback) {
      return { ...fallback, requestedLocale: locale, isFallback: true }
    }
  }
  return null
}

function getPostSortTime(post: Post): number {
  const value = post.frontmatter.publishedAt || post.frontmatter.updated || post.frontmatter.date
  return Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+08:00` : value)
}

export function sortPostsByDateDesc(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => {
    const aTime = getPostSortTime(a)
    const bTime = getPostSortTime(b)
    return bTime - aTime || a.slug.localeCompare(b.slug) || a.locale.localeCompare(b.locale)
  })
}

export async function getPostsByLocaleAsync(locale: Locale): Promise<Post[]> {
  return sortPostsByDateDesc((await getAllPostsAsync()).filter(post => post.locale === locale))
}

export function paginatePosts(posts: Post[], page: number, pageSize: number): {
  items: Post[]
  page: number
  pageSize: number
  total: number
  totalPages: number
} {
  const normalizedPage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
  const normalizedPageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 10
  const total = posts.length
  const totalPages = Math.max(1, Math.ceil(total / normalizedPageSize))
  const safePage = Math.min(normalizedPage, totalPages)
  const start = (safePage - 1) * normalizedPageSize

  return {
    items: posts.slice(start, start + normalizedPageSize),
    page: safePage,
    pageSize: normalizedPageSize,
    total,
    totalPages
  }
}

export async function getPostNeighborsAsync(locale: Locale, slug: string): Promise<{
  prev: Post | null
  next: Post | null
}> {
  const posts = await getPostsByLocaleAsync(locale)
  const index = posts.findIndex(post => post.slug === slug)
  if (index === -1) {
    return { prev: null, next: null }
  }
  return {
    prev: posts[index + 1] ?? null,
    next: posts[index - 1] ?? null
  }
}

export async function getLocaleTagsAsync(locale: Locale): Promise<string[]> {
  const tags = (await getPostsByLocaleAsync(locale)).flatMap(post => post.frontmatter.tags)
  return unique(tags).sort((a, b) => a.localeCompare(b))
}

export async function getLocaleCategoriesAsync(locale: Locale): Promise<string[]> {
  const categories = (await getPostsByLocaleAsync(locale)).map(post => post.frontmatter.category)
  return unique(categories).sort((a, b) => a.localeCompare(b))
}

export async function getLatestPostAsync(locale: Locale): Promise<Post | null> {
  return (await getPostsByLocaleAsync(locale))[0] ?? null
}

export async function getCategoryCountsAsync(locale: Locale): Promise<Array<{ name: string; count: number }>> {
  const counts = new Map<string, number>()
  for (const post of await getPostsByLocaleAsync(locale)) {
    counts.set(post.frontmatter.category, (counts.get(post.frontmatter.category) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

export async function getTagCountsAsync(locale: Locale): Promise<Array<{ name: string; count: number }>> {
  const counts = new Map<string, number>()
  for (const post of await getPostsByLocaleAsync(locale)) {
    for (const tag of post.frontmatter.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

export async function getRepoCardsConfigAsync(slug: string): Promise<RepoCardsConfig> {
  const snapshot = await getPublicContentSnapshot()
  if (snapshot.remote) {
    return snapshot.repoCardsBySlug[slug] ?? buildDefaultRepoCardsConfig()
  }
  return getRepoCardsConfigFromLocal(slug)
}

export function getAllLocalizedRouteParams(): Array<{ locale: Locale; slug: string }> {
  const slugs = unique(getAllLocalPosts().filter(isPublicPost).map(post => post.slug)).sort((a, b) => a.localeCompare(b))
  return locales.flatMap(locale => slugs.map(slug => ({ locale, slug })))
}
