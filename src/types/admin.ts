import type { PostFrontmatter } from '@/types/content'

export type AdminLocale = 'zh' | 'en'

export type AdminSubmitMode = 'publish' | 'draft'

export type AiTask = 'translate' | 'frontmatter_enrich' | 'github_hot_post_generate'

export type AiProvider = 'gemini' | 'openai' | 'deepseek' | 'qwen'

export type AiExecutionStep = {
  task: AiTask
  locale: AdminLocale
  sourceLocale?: AdminLocale
  provider: AiProvider
  model: string
  attempt: number
  status: 'success' | 'failed' | 'skipped'
  reason?: string
}

export type AdminPostFrontmatterInput = {
  title: string
  date: string
  summary?: string
  tags?: string[]
  category?: string
  cover?: string
  draft?: boolean
  updated?: string
}

export type AdminPostPayload = {
  locale: AdminLocale
  frontmatter: AdminPostFrontmatterInput
  markdown: string
  baseSha?: string | null
}

export type AdminPostSubmitRequest = {
  slug: string
  mode: AdminSubmitMode
  changes: Array<AdminPostPayload>
}

export type PublishResult = {
  branch: string
  prNumber: number
  prUrl: string
  merged: boolean
  mergeMessage?: string
  deploy?: DeployTriggerResult
}

export type DeployTriggerResult = {
  triggered: boolean
  success: boolean
  status?: number
  message?: string
}

export type AdminAiResult = {
  triggered: boolean
  mode: AdminSubmitMode
  steps: AiExecutionStep[]
}

export type FrontmatterEnrichPayload = {
  summary: string
  tags: string[]
  category: string
}

export type TranslatedLocalePayload = FrontmatterEnrichPayload & {
  title: string
  markdown: string
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
