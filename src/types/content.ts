import type { Locale } from '@/i18n/config'

export type PostFrontmatter = {
  title: string
  date: string
  summary: string
  tags: string[]
  category: string
  cover?: string
  draft?: boolean
  updated?: string
}

export type Post = {
  slug: string
  locale: Locale
  frontmatter: PostFrontmatter
  content: string
  readingTime: number
}

export type LocalizedPost = Post & {
  requestedLocale: Locale
  isFallback: boolean
}

export type TocItem = {
  id: string
  text: string
  depth: number
}
