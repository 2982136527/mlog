import matter from 'gray-matter'
import { z } from 'zod'
import type { AdminLocale } from '@/types/admin'
import type { PostFrontmatter } from '@/types/content'
import { postFrontmatterSchema, slugSchema } from '@/lib/content/schema'

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
  return `${matter.stringify(body ? `${body}\n` : '', validated).trimEnd()}\n`
}

export const adminPostChangeSchema = z.object({
  locale: adminLocaleSchema,
  frontmatter: postFrontmatterSchema,
  markdown: z.string(),
  baseSha: z.string().trim().optional().nullable()
})

export const adminPostWriteSchema = z.object({
  slug: slugSchema,
  changes: z.array(adminPostChangeSchema).min(1)
})
