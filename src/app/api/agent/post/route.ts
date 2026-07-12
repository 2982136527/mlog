import { NextRequest } from 'next/server'
import { z } from 'zod'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { validateAgentRequest } from '@/lib/agent/auth'
import { publishPostChanges } from '@/lib/admin/publish-service'

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
  cover: z.string().trim().optional()
})

export async function POST(request: NextRequest) {
  const requestId = createRequestId()

  try {
    const userLogin = await validateAgentRequest(request)

    const body = await request.json().catch(() => {
      throw new AdminHttpError(400, 'INVALID_JSON', 'Request body must be valid JSON.')
    })

    const parsed = agentPostSchema.parse(body)
    const date = parsed.date || new Date().toISOString().split('T')[0]

    const frontmatterBase = {
      date,
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
      requestId
    })

    console.info('[agent][post][POST]', {
      requestId,
      actor: userLogin,
      slug: parsed.slug,
      changedPaths: result.changedPaths,
      prUrl: result.result.prUrl,
      merged: result.result.merged
    })

    return ok(requestId, {
      success: true,
      slug: parsed.slug,
      pr: {
        number: result.result.prNumber,
        url: result.result.prUrl,
        merged: result.result.merged
      }
    })
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
