import matter from 'gray-matter'
import { z } from 'zod'
import type { AdminLocale } from '@/types/admin'
import type { AdminPostFrontmatterInput } from '@/types/admin'
import type { PostFrontmatter } from '@/types/content'
import { postFrontmatterSchema, slugSchema } from '@/lib/content/schema'
import { parseGithubRepoUrl } from '@/lib/blog/repo-cards-config'

function isValidGithubRepoUrl(value: string): boolean {
  try {
    parseGithubRepoUrl(value)
    return true
  } catch {
    return false
  }
}

export const adminLocaleSchema = z.enum(['zh', 'en'])

export function buildPostMarkdownPath(slug: string, locale: AdminLocale): string {
  const parsedSlug = slugSchema.parse(slug)
  return `content/posts/${parsedSlug}/${locale}.md`
}

export function parseMarkdownFile(raw: string, fileLabel: string): { frontmatter: PostFrontmatter; markdown: string } {
  const parsed = matter(raw)
  const validated = postFrontmatterSchema.safeParse(parsed.data)

  if (!validated.success) {
    const issues = validated.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')
    throw new Error(`Invalid frontmatter in ${fileLabel}: ${issues}`)
  }

  return {
    frontmatter: validated.data,
    markdown: parsed.content.replace(/\s+$/, '')
  }
}

export function serializeMarkdownFile(frontmatter: PostFrontmatter, markdown: string): string {
  const validated = postFrontmatterSchema.parse(frontmatter)
  const body = markdown.trimEnd()
  const serializable = Object.fromEntries(Object.entries(validated).filter(([, value]) => value !== undefined))
  return `${matter.stringify(body ? `${body}\n` : '', serializable).trimEnd()}\n`
}

export const adminPostFrontmatterInputSchema = z.object({
  title: z.string().trim().min(1),
  date: z
    .string()
    .trim()
    .refine(value => !Number.isNaN(Date.parse(value)), 'date must be a valid ISO 8601 date string'),
  summary: z.string().optional(),
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),
  cover: z.string().trim().optional(),
  draft: z.boolean().optional(),
  updated: z
    .string()
    .trim()
    .refine(value => !Number.isNaN(Date.parse(value)), 'updated must be a valid ISO 8601 date string')
    .optional()
})

export const adminPostChangeSchema = z.object({
  locale: adminLocaleSchema,
  frontmatter: adminPostFrontmatterInputSchema,
  markdown: z.string(),
  baseSha: z.string().trim().optional().nullable()
})

export const adminRepoCardsInputSchema = z
  .object({
    enabled: z.boolean(),
    repoUrl: z.string().trim().optional()
  })
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return
    }

    if (!value.repoUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['repoUrl'],
        message: 'repoUrl is required when repo cards are enabled'
      })
      return
    }

    if (!isValidGithubRepoUrl(value.repoUrl)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['repoUrl'],
        message: 'repoUrl must be a valid GitHub repository URL'
      })
    }
  })

export const adminPostWriteSchema = z.object({
  slug: slugSchema,
  mode: z.enum(['publish', 'draft']),
  changes: z.array(adminPostChangeSchema).min(1),
  repoCards: adminRepoCardsInputSchema.optional()
})

export function normalizeAdminFrontmatterInput(frontmatter: AdminPostFrontmatterInput): AdminPostFrontmatterInput {
  return {
    title: frontmatter.title.trim(),
    date: frontmatter.date.trim(),
    summary: frontmatter.summary?.trim(),
    tags: frontmatter.tags?.map(tag => tag.trim()).filter(Boolean),
    category: frontmatter.category?.trim(),
    cover: frontmatter.cover?.trim(),
    draft: frontmatter.draft,
    updated: frontmatter.updated?.trim()
  }
}
