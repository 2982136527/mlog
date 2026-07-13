import { beforeEach, describe, expect, it, vi } from 'vitest'

const cacheMocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn()
}))

vi.mock('next/cache', () => cacheMocks)

import { PUBLIC_CONTENT_CACHE_TAG } from '@/lib/content/cache'
import { revalidatePublicContent } from '@/lib/content/revalidation'

describe('revalidatePublicContent', () => {
  beforeEach(() => {
    cacheMocks.revalidatePath.mockClear()
    cacheMocks.revalidateTag.mockClear()
  })

  it('invalidates the shared snapshot and every public article surface', () => {
    expect(revalidatePublicContent(['content/posts/new-post/zh.md', 'content/posts/new-post/en.md'])).toBe(true)

    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith(PUBLIC_CONTENT_CACHE_TAG, { expire: 0 })
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith('/sitemap.xml')
    for (const locale of ['zh', 'en']) {
      expect(cacheMocks.revalidatePath).toHaveBeenCalledWith(`/${locale}`)
      expect(cacheMocks.revalidatePath).toHaveBeenCalledWith(`/${locale}/blog`)
      expect(cacheMocks.revalidatePath).toHaveBeenCalledWith(`/${locale}/rss.xml`)
      expect(cacheMocks.revalidatePath).toHaveBeenCalledWith(`/${locale}/blog/new-post`)
    }
  })

  it('does not invalidate article caches for static media-only changes', () => {
    expect(revalidatePublicContent(['public/images/uploads/2026/07/image.png'])).toBe(false)
    expect(cacheMocks.revalidateTag).not.toHaveBeenCalled()
    expect(cacheMocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('invalidates repo-card changes and de-duplicates multiple paths for each slug', () => {
    expect(revalidatePublicContent([
      'content/posts/first/repo-cards.json',
      'content/posts/first/zh.md',
      'content/posts/second/en.md'
    ])).toBe(true)

    for (const locale of ['zh', 'en']) {
      expect(cacheMocks.revalidatePath).toHaveBeenCalledWith(`/${locale}/blog/first`)
      expect(cacheMocks.revalidatePath).toHaveBeenCalledWith(`/${locale}/blog/second`)
      expect(cacheMocks.revalidatePath.mock.calls.filter(([path]) => path === `/${locale}/blog/first`)).toHaveLength(1)
    }
  })

  it('does nothing for empty changes', () => {
    expect(revalidatePublicContent([])).toBe(false)
    expect(cacheMocks.revalidateTag).not.toHaveBeenCalled()
    expect(cacheMocks.revalidatePath).not.toHaveBeenCalled()
  })
})
