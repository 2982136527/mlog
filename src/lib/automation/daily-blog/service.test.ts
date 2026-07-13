import { describe, expect, it } from 'vitest'
import { buildDailyBlogSlug, pickDailyBlogTopic } from '@/lib/automation/daily-blog/service'
import { buildDefaultDailyBlogConfig } from '@/lib/automation/daily-blog/config'
import { slugSchema } from '@/lib/content/schema'

describe('buildDailyBlogSlug', () => {
  it('creates a valid stable slug for a Chinese topic', () => {
    const slug = buildDailyBlogSlug('20260713', '人工智能与软件工程')

    expect(slug).toBe(buildDailyBlogSlug('20260713', '人工智能与软件工程'))
    expect(slug).toMatch(/^daily-blog-20260713-[a-f0-9]{6}$/)
    expect(slugSchema.parse(slug)).toBe(slug)
  })

  it('keeps a readable ASCII topic segment', () => {
    const slug = buildDailyBlogSlug('20260713', 'Next.js Architecture')

    expect(slug).toMatch(/^daily-blog-20260713-next-js-architecture-[a-f0-9]{6}$/)
    expect(slugSchema.parse(slug)).toBe(slug)
  })
})

describe('pickDailyBlogTopic', () => {
  it('applies excluded topics to category and custom candidates', () => {
    const config = {
      ...buildDefaultDailyBlogConfig(),
      topicCategories: ['技术思考'],
      customTopics: ['工程实践'],
      excludeTopics: ['技术思考', '工程实践']
    }

    expect(pickDailyBlogTopic(config, '20260713')).toBeNull()
  })
})
