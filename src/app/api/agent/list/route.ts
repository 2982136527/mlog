import { NextRequest } from 'next/server'
import { createRequestId, ok } from '@/lib/admin/response'
import { validateAgentRequest } from '@/lib/agent/auth'
import { getAllPostsAsync } from '@/lib/content'

export async function GET(request: NextRequest) {
  const requestId = createRequestId()

  try {
    await validateAgentRequest(request)
    const posts = await getAllPostsAsync()

    // Group by slug to combine zh + en titles
    const postMap = new Map<string, {
      slug: string
      zhTitle: string | null
      enTitle: string | null
      category: string
      publishedAt: string
    }>()

    for (const post of posts) {
      const existing = postMap.get(post.slug)
      if (existing) {
        if (post.locale === 'zh') existing.zhTitle = post.frontmatter.title
        if (post.locale === 'en') existing.enTitle = post.frontmatter.title
      } else {
        postMap.set(post.slug, {
          slug: post.slug,
          zhTitle: post.locale === 'zh' ? post.frontmatter.title : null,
          enTitle: post.locale === 'en' ? post.frontmatter.title : null,
          category: post.frontmatter.category,
          publishedAt: post.frontmatter.publishedAt || post.frontmatter.date
        })
      }
    }

    const allPosts = Array.from(postMap.values()).sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    )

    return ok(requestId, {
      total: allPosts.length,
      posts: allPosts
    })
  } catch (error) {
    console.error('[agent][list][GET]', { requestId, error: error instanceof Error ? error.message : error })
    throw error
  }
}

export const dynamic = 'force-dynamic'
