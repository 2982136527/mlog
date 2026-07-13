const INVALID_XML_10_CHARS = /[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu

function sanitizeXmlText(value: string): string {
  return value.replace(INVALID_XML_10_CHARS, '')
}

export function toXmlCdata(value: string): string {
  const safe = sanitizeXmlText(value).replaceAll(']]>', ']]]]><![CDATA[>')
  return `<![CDATA[${safe}]]>`
}

export function escapeXmlText(value: string): string {
  return sanitizeXmlText(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}
