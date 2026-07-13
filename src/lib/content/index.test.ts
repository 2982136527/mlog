import { describe, expect, it } from 'vitest'
import type { Post } from '@/types/content'
import { isPublicPost, sortPostsByDateDesc } from '@/lib/content'

function post(draft?: boolean): Post {
  return {
    slug: 'test-post',
    locale: 'zh',
    frontmatter: {
      title: 'Test',
      date: '2026-07-13',
      summary: 'Summary',
      tags: ['test'],
      category: 'Test',
      draft
    },
    content: 'Body',
    readingTime: 1
  }
}

describe('public post visibility', () => {
  it('excludes drafts and includes posts without the draft flag', () => {
    expect(isPublicPost(post(true))).toBe(false)
    expect(isPublicPost(post(false))).toBe(true)
    expect(isPublicPost(post())).toBe(true)
  })
})

describe('post ordering', () => {
  it('uses the precise publication time for posts on the same calendar date', () => {
    const older = post()
    older.slug = 'zzz-older'
    older.frontmatter.publishedAt = '2026-07-13T01:00:00.000Z'
    const newer = post()
    newer.slug = 'aaa-newer'
    newer.frontmatter.publishedAt = '2026-07-13T02:00:00.000Z'

    expect(sortPostsByDateDesc([older, newer]).map(item => item.slug)).toEqual(['aaa-newer', 'zzz-older'])
  })

  it('uses a stable slug tie-breaker for legacy date-only posts', () => {
    const first = post()
    first.slug = 'z-post'
    const second = post()
    second.slug = 'a-post'

    expect(sortPostsByDateDesc([first, second]).map(item => item.slug)).toEqual(['a-post', 'z-post'])
  })

  it('treats a legacy date-only value as Shanghai midnight', () => {
    const legacy = post()
    legacy.slug = 'legacy-midnight'
    const earlyMorning = post()
    earlyMorning.slug = 'new-at-one-am'
    earlyMorning.frontmatter.publishedAt = '2026-07-12T17:00:00.000Z'

    expect(sortPostsByDateDesc([legacy, earlyMorning]).map(item => item.slug)).toEqual([
      'new-at-one-am',
      'legacy-midnight'
    ])
  })
})
