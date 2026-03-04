import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import readingTime from 'reading-time'
import { cache } from 'react'
import { defaultLocale, type Locale, locales } from '@/i18n/config'
import type { LocalizedPost, Post, PostFrontmatter } from '@/types/content'
import { unique } from '@/lib/utils'
import { postFrontmatterSchema } from '@/lib/content/schema'

const CONTENT_ROOT = path.join(process.cwd(), 'content', 'posts')

function ensureContentRootExists(): void {
  if (!fs.existsSync(CONTENT_ROOT)) {
    throw new Error(`Content directory not found: ${CONTENT_ROOT}`)
  }
}

function readMarkdownFile(filePath: string, locale: Locale, slug: string): Post {
  const raw = fs.readFileSync(filePath, 'utf8')
  const parsed = matter(raw)
  const validated = postFrontmatterSchema.safeParse(parsed.data)

  if (!validated.success) {
    const issues = validated.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')
    throw new Error(`Invalid frontmatter in ${filePath} (${slug}/${locale}): ${issues}`)
  }

  const minutes = readingTime(parsed.content).minutes

  return {
    slug,
    locale,
    frontmatter: validated.data as PostFrontmatter,
    content: parsed.content,
    readingTime: Math.max(1, Math.ceil(minutes))
  }
}

function readAllPostsUnsafe(): Post[] {
  ensureContentRootExists()

  const slugDirs = fs
    .readdirSync(CONTENT_ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)

  const posts: Post[] = []

  for (const slug of slugDirs) {
    for (const locale of locales) {
      const filePath = path.join(CONTENT_ROOT, slug, `${locale}.md`)
      if (!fs.existsSync(filePath)) {
        continue
      }
      posts.push(readMarkdownFile(filePath, locale, slug))
    }
  }

  return posts
}

export const getAllPosts = cache((): Post[] => {
  return readAllPostsUnsafe()
})

export const getAllSlugs = cache((): string[] => {
  return unique(getAllPosts().map(post => post.slug)).sort((a, b) => a.localeCompare(b))
})

export function hasLocalePost(slug: string, locale: Locale): boolean {
  return getAllPosts().some(post => post.slug === slug && post.locale === locale)
}

export function getPost(locale: Locale, slug: string): Post | null {
  return getAllPosts().find(post => post.slug === slug && post.locale === locale) ?? null
}

export function getLocalizedPost(locale: Locale, slug: string): LocalizedPost | null {
  const exact = getPost(locale, slug)

  if (exact) {
    return {
      ...exact,
      requestedLocale: locale,
      isFallback: false
    }
  }

  if (locale !== defaultLocale) {
    const fallback = getPost(defaultLocale, slug)
    if (fallback) {
      return {
        ...fallback,
        requestedLocale: locale,
        isFallback: true
      }
    }
  }

  return null
}

function sortByDateDesc(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => {
    return new Date(b.frontmatter.date).getTime() - new Date(a.frontmatter.date).getTime()
  })
}

export function getPostsByLocale(locale: Locale, options?: { includeDraft?: boolean }): Post[] {
  const includeDraft = options?.includeDraft ?? false
  const scoped = getAllPosts().filter(post => post.locale === locale)
  const visible = includeDraft ? scoped : scoped.filter(post => !post.frontmatter.draft)
  return sortByDateDesc(visible)
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
  const end = start + normalizedPageSize

  return {
    items: posts.slice(start, end),
    page: safePage,
    pageSize: normalizedPageSize,
    total,
    totalPages
  }
}

export function getPostNeighbors(locale: Locale, slug: string): {
  prev: Post | null
  next: Post | null
} {
  const posts = getPostsByLocale(locale)
  const index = posts.findIndex(post => post.slug === slug)

  if (index === -1) {
    return { prev: null, next: null }
  }

  return {
    prev: posts[index + 1] ?? null,
    next: posts[index - 1] ?? null
  }
}

export function getLocaleTags(locale: Locale): string[] {
  const tags = getPostsByLocale(locale).flatMap(post => post.frontmatter.tags)
  return unique(tags).sort((a, b) => a.localeCompare(b))
}

export function getLocaleCategories(locale: Locale): string[] {
  const categories = getPostsByLocale(locale).map(post => post.frontmatter.category)
  return unique(categories).sort((a, b) => a.localeCompare(b))
}

export function getLatestPost(locale: Locale): Post | null {
  return getPostsByLocale(locale)[0] ?? null
}

export function getCategoryCounts(locale: Locale): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>()
  for (const post of getPostsByLocale(locale)) {
    counts.set(post.frontmatter.category, (counts.get(post.frontmatter.category) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

export function getTagCounts(locale: Locale): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>()
  for (const post of getPostsByLocale(locale)) {
    for (const tag of post.frontmatter.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

export function getAllLocalizedRouteParams(): Array<{ locale: Locale; slug: string }> {
  const slugs = getAllSlugs()
  return locales.flatMap(locale => slugs.map(slug => ({ locale, slug })))
}
