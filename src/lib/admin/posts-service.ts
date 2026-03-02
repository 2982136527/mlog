import type { AdminLocale, AdminPostDetail, AdminPostSummary } from '@/types/admin'
import type { PostFrontmatter } from '@/types/content'
import { listContentMarkdownPaths, getRepoTextFile } from '@/lib/admin/github-client'
import { buildPostMarkdownPath, parseMarkdownFile } from '@/lib/admin/post-serializer'
import { slugSchema } from '@/lib/content/schema'
import { AdminHttpError } from '@/lib/admin/errors'

const LOCALES: AdminLocale[] = ['zh', 'en']

function getPathInfo(path: string): { slug: string; locale: AdminLocale } | null {
  const matched = path.match(/^content\/posts\/([^/]+)\/(zh|en)\.md$/)
  if (!matched) {
    return null
  }

  return {
    slug: matched[1],
    locale: matched[2] as AdminLocale
  }
}

function defaultFrontmatter(): PostFrontmatter {
  const date = new Date().toISOString().slice(0, 10)
  return {
    title: '',
    date,
    summary: '',
    tags: [''],
    category: '',
    cover: '',
    draft: true,
    updated: date
  }
}

type GroupedSummary = {
  slug: string
  locales: AdminPostSummary['locales']
  summaries: string[]
}

export async function listAdminPosts(filters?: {
  locale?: AdminLocale
  keyword?: string
  status?: 'draft' | 'published' | 'all'
}): Promise<AdminPostSummary[]> {
  const paths = await listContentMarkdownPaths()
  const grouped = new Map<string, GroupedSummary>()

  await Promise.all(
    paths.map(async path => {
      const info = getPathInfo(path)
      if (!info) return

      const file = await getRepoTextFile(path)
      if (!file) return

      const parsed = parseMarkdownFile(file.content, path)
      const next = grouped.get(info.slug) || {
        slug: info.slug,
        locales: {},
        summaries: []
      }

      next.locales[info.locale] = {
        title: parsed.frontmatter.title,
        draft: Boolean(parsed.frontmatter.draft),
        updatedAt: parsed.frontmatter.updated || parsed.frontmatter.date,
        sha: file.sha
      }
      next.summaries.push(parsed.frontmatter.summary)

      grouped.set(info.slug, next)
    })
  )

  const keyword = (filters?.keyword || '').trim().toLowerCase()
  const statusFilter = filters?.status || 'all'

  const rows = Array.from(grouped.values())
    .map(item => {
      const zh = item.locales.zh
      const en = item.locales.en
      const title = zh?.title || en?.title || item.slug
      const updatedAt = [zh?.updatedAt, en?.updatedAt].filter(Boolean).sort().reverse()[0] || ''
      const draft = Boolean(zh?.draft || en?.draft)

      return {
        slug: item.slug,
        hasZh: Boolean(zh),
        hasEn: Boolean(en),
        updatedAt,
        draft,
        title,
        locales: item.locales,
        _summaryIndex: item.summaries.join(' ').toLowerCase()
      }
    })
    .filter(row => {
      if (filters?.locale && !row.locales[filters.locale]) {
        return false
      }

      if (statusFilter === 'draft' && !row.draft) {
        return false
      }

      if (statusFilter === 'published' && row.draft) {
        return false
      }

      if (!keyword) {
        return true
      }

      return row.slug.toLowerCase().includes(keyword) || row.title.toLowerCase().includes(keyword) || row._summaryIndex.includes(keyword)
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return rows.map(row => ({
    slug: row.slug,
    hasZh: row.hasZh,
    hasEn: row.hasEn,
    updatedAt: row.updatedAt,
    draft: row.draft,
    title: row.title,
    locales: row.locales
  }))
}

export async function getAdminPostDetail(slugInput: string): Promise<AdminPostDetail> {
  const slug = slugSchema.parse(slugInput)

  const locales: Record<AdminLocale, AdminPostDetail['locales'][AdminLocale]> = {
    zh: {
      locale: 'zh' as const,
      exists: false,
      sha: null,
      frontmatter: null,
      markdown: '',
      path: buildPostMarkdownPath(slug, 'zh')
    },
    en: {
      locale: 'en' as const,
      exists: false,
      sha: null,
      frontmatter: null,
      markdown: '',
      path: buildPostMarkdownPath(slug, 'en')
    }
  }

  await Promise.all(
    LOCALES.map(async locale => {
      const path = buildPostMarkdownPath(slug, locale)
      const file = await getRepoTextFile(path)
      if (!file) {
        return
      }

      const parsed = parseMarkdownFile(file.content, path)
      locales[locale] = {
        locale,
        exists: true,
        sha: file.sha,
        frontmatter: parsed.frontmatter,
        markdown: parsed.markdown,
        path
      }
    })
  )

  if (!locales.zh.exists && !locales.en.exists) {
    throw new AdminHttpError(404, 'NOT_FOUND', `Post not found: ${slug}`)
  }

  return {
    slug,
    locales
  }
}

export function getEmptyAdminPost(slugInput?: string): AdminPostDetail {
  const slug = slugInput ? slugSchema.parse(slugInput) : ''

  return {
    slug,
    locales: {
      zh: {
        locale: 'zh',
        exists: false,
        sha: null,
        frontmatter: defaultFrontmatter(),
        markdown: '',
        path: slug ? buildPostMarkdownPath(slug, 'zh') : 'content/posts/<slug>/zh.md'
      },
      en: {
        locale: 'en',
        exists: false,
        sha: null,
        frontmatter: defaultFrontmatter(),
        markdown: '',
        path: slug ? buildPostMarkdownPath(slug, 'en') : 'content/posts/<slug>/en.md'
      }
    }
  }
}
