import { NextRequest } from 'next/server'
import { z } from 'zod'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { validateAgentRequest } from '@/lib/agent/auth'
import { publishPostChanges } from '@/lib/admin/publish-service'
import { getDateIsoInTimeZone } from '@/lib/date'
import { isAllowedPublicMediaUrl } from '@/lib/media/public-url'
import { warmupPublishedPages } from '@/lib/content/revalidation'

const contentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(500),
  content: z.string().trim().min(1)
})

const agentPostSchema = z.object({
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/, '只能包含小写字母、数字和连字符'),
  zh: contentSchema,
  en: contentSchema,
  tags: z.array(z.string().trim().min(1)).min(1).max(10),
  category: z.string().trim().min(1),
  date: z.string().trim().optional(),
  cover: z.string().trim().max(2048)
    .refine(value => !value || isAllowedPublicMediaUrl(value), '必须使用已配置图床/CDN URL 或 /images 路径')
    .optional()
})

export async function POST(request: NextRequest) {
  const requestId = createRequestId()

  try {
    const userLogin = await validateAgentRequest(request)

    const body = await request.json().catch(() => {
      throw new AdminHttpError(400, 'INVALID_JSON', 'Request body must be valid JSON.')
    })

    const parsed = agentPostSchema.parse(body)
    const date = parsed.date || getDateIsoInTimeZone()

    const frontmatterBase = {
      date,
      publishedAt: date,
      tags: parsed.tags,
      category: parsed.category,
      draft: false
    }

    const result = await publishPostChanges({
      slug: parsed.slug,
      mode: 'publish',
      changes: [
        {
          locale: 'zh' as const,
          frontmatter: { ...frontmatterBase, title: parsed.zh.title, summary: parsed.zh.summary, cover: parsed.cover || undefined },
          markdown: parsed.zh.content
        },
        {
          locale: 'en' as const,
          frontmatter: { ...frontmatterBase, title: parsed.en.title, summary: parsed.en.summary, cover: parsed.cover || undefined },
          markdown: parsed.en.content
        }
      ],
      actor: userLogin,
      requestId,
      expectedAction: 'create'
    })

    console.info('[agent][post][POST]', {
      requestId,
      actor: userLogin,
      slug: parsed.slug,
      changedPaths: result.changedPaths,
      prUrl: result.result.prUrl,
      merged: result.result.merged,
      branchSynchronized: result.result.branchSynchronized,
      cacheInvalidated: result.result.cacheInvalidated
    })

   const merged = result.result.merged

    // Always try to warm up after a successful merge, even if branch sync 
    // or cache invalidation haven't fully propagated yet. The warmup has 
    // built-in retries and the tarball CDN typically catches up within seconds.
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      `${request.nextUrl.protocol}//${request.nextUrl.host}`
    await warmupPublishedPages(baseUrl, parsed.slug).catch(() => undefined)

    const refreshPending = merged && (!result.result.branchSynchronized || !result.result.cacheInvalidated)
    const published = merged && !refreshPending

    return ok(requestId, {
      success: published,
      status: published ? 'published' : refreshPending ? 'refresh_pending' : 'pending_review',
      slug: parsed.slug,
      pr: {
        number: result.result.prNumber,
        url: result.result.prUrl,
        merged: result.result.merged
      },
      publish: result.result
    }, { status: published ? 200 : 202 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      const first = error.issues[0]
      return fail(requestId, 400, 'INVALID_INPUT', `${first.path.join('.')}: ${first.message}`)
    }
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[agent][post][POST]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to create post.')
  }
}

export const dynamic = 'force-dynamic'
