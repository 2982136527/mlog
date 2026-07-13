import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '@/lib/markdown'

describe('renderMarkdown', () => {
  it('removes executable URL protocols while preserving safe links', async () => {
    const { html } = await renderMarkdown([
      '[unsafe](javascript:alert(1))',
      '',
      '[safe](https://example.com/path)',
      '',
      '![unsafe image](javascript:alert(2))'
    ].join('\n'))

    expect(html).not.toContain('javascript:')
    expect(html).toContain('href="https://example.com/path"')
  })
})
