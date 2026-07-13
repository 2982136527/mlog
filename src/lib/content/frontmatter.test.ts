import { describe, expect, it } from 'vitest'
import { parsePostMatter } from '@/lib/content/frontmatter'
import { postFrontmatterSchema } from '@/lib/content/schema'

describe('post frontmatter limits', () => {
  it('rejects YAML alias expansion beyond the configured budget', () => {
    const aliases = Array.from({ length: 25 }, () => '*topic').join(', ')
    const raw = `---\ntitle: Test\ndate: 2026-07-13\nsummary: Test\ncategory: Test\nbase: &topic topic\ntags: [${aliases}]\n---\nBody`

    expect(() => parsePostMatter(raw)).toThrow()
  })

  it('bounds repeated metadata fields', () => {
    const parsed = postFrontmatterSchema.safeParse({
      title: 'Test',
      date: '2026-07-13',
      summary: 'Test',
      category: 'Test',
      tags: Array.from({ length: 21 }, (_, index) => `tag-${index}`)
    })

    expect(parsed.success).toBe(false)
  })
})
