import type { PostFrontmatter } from '@/types/content'

export type AdminLocale = 'zh' | 'en'

export type AdminPostPayload = {
  locale: AdminLocale
  frontmatter: PostFrontmatter
  markdown: string
  baseSha?: string | null
}

export type PublishResult = {
  branch: string
  prNumber: number
  prUrl: string
  merged: boolean
  mergeMessage?: string
}

export type AdminPostLocaleData = {
  locale: AdminLocale
  exists: boolean
  sha: string | null
  frontmatter: PostFrontmatter | null
  markdown: string
  path: string
}

export type AdminPostDetail = {
  slug: string
  locales: Record<AdminLocale, AdminPostLocaleData>
}

export type AdminPostSummary = {
  slug: string
  hasZh: boolean
  hasEn: boolean
  updatedAt: string
  draft: boolean
  title: string
  locales: {
    zh?: { title: string; draft: boolean; updatedAt: string; sha: string | null }
    en?: { title: string; draft: boolean; updatedAt: string; sha: string | null }
  }
}
