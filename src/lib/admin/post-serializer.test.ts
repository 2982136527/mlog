import { describe, expect, it } from 'vitest'
import { adminPostSubmitSchema, resolvePublishedAt } from '@/lib/admin/post-serializer'

const validRequest = {
  slug: 'safe-post',
  mode: 'publish',
  expectedAction: 'create',
  changes: [
    {
      locale: 'zh',
      frontmatter: {
        title: 'Title',
        date: '2026-07-13'
      },
      markdown: 'Body',
      baseSha: null
    }
  ]
}

describe('adminPostSubmitSchema', () => {
  it('requires an explicit create or update intent', () => {
    expect(adminPostSubmitSchema.safeParse(validRequest).success).toBe(true)
    expect(adminPostSubmitSchema.safeParse({ ...validRequest, expectedAction: undefined }).success).toBe(false)
    expect(adminPostSubmitSchema.safeParse({ ...validRequest, expectedAction: 'overwrite' }).success).toBe(false)
  })

  it('does not silently convert an invalid mode into publish', () => {
    expect(adminPostSubmitSchema.safeParse({ ...validRequest, mode: 'publsih' }).success).toBe(false)
    expect(adminPostSubmitSchema.safeParse(null).success).toBe(false)
  })
})

describe('resolvePublishedAt', () => {
  const now = '2026-07-13T05:00:00.000Z'

  it('does not timestamp a new draft', () => {
    expect(resolvePublishedAt({ mode: 'draft', existing: null, now })).toBeUndefined()
  })

  it('timestamps the first transition from draft to published', () => {
    expect(resolvePublishedAt({
      mode: 'publish',
      existing: { draft: true, publishedAt: undefined },
      now
    })).toBe(now)
  })

  it('preserves the timestamp when updating a published post', () => {
    const publishedAt = '2026-07-12T05:00:00.000Z'
    expect(resolvePublishedAt({
      mode: 'publish',
      existing: { draft: false, publishedAt },
      now
    })).toBe(publishedAt)
  })
})
