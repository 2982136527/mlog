import { isLocale } from '@/i18n/config'
import { getPostsByLocale } from '@/lib/content'
import { formatRfc822 } from '@/lib/date'
import { getSiteUrl } from '@/lib/site'

export async function GET(_: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params

  if (!isLocale(locale)) {
    return new Response('Not found', { status: 404 })
  }

  const siteUrl = getSiteUrl()
  const posts = getPostsByLocale(locale)

  const items = posts
    .map(post => {
      const url = `${siteUrl}/${locale}/blog/${post.slug}`
      return `\n<item>\n<title><![CDATA[${post.frontmatter.title}]]></title>\n<link>${url}</link>\n<guid>${url}</guid>\n<pubDate>${formatRfc822(post.frontmatter.date)}</pubDate>\n<description><![CDATA[${post.frontmatter.summary}]]></description>\n</item>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8" ?>\n<rss version="2.0">\n<channel>\n<title>MLog (${locale.toUpperCase()})</title>\n<link>${siteUrl}/${locale}</link>\n<description>Bilingual posts feed</description>${items}\n</channel>\n</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8'
    }
  })
}
