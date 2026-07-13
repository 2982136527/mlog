import { describe, expect, it } from 'vitest'
import { escapeXmlText, toXmlCdata } from '@/lib/rss'

describe('RSS XML encoding', () => {
  it('splits CDATA terminators without changing the text value', () => {
    expect(toXmlCdata('before]]>after')).toBe('<![CDATA[before]]]]><![CDATA[>after]]>')
  })

  it('removes XML 1.0 control characters and escapes plain text', () => {
    expect(toXmlCdata('safe\u0000text')).toBe('<![CDATA[safetext]]>')
    expect(escapeXmlText('a&b<c>')).toBe('a&amp;b&lt;c&gt;')
  })
})
