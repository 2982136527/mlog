import { isLocale } from '@/i18n/config'
import { getPostsByLocaleAsync } from '@/lib/content'
import { formatRfc822 } from '@/lib/date'
import { escapeXmlText, toXmlCdata } from '@/lib/rss'
import { getSiteUrl } from '@/lib/site'

export async function GET(_: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params

  if (!isLocale(locale)) {
    return new Response('Not found', { status: 404 })
  }

  const siteUrl = getSiteUrl()
  const posts = await getPostsByLocaleAsync(locale)

  const items = posts
    .map(post => {
      const url = `${siteUrl}/${locale}/blog/${post.slug}`
      const safeUrl = escapeXmlText(url)
      return `\n<item>\n<title>${toXmlCdata(post.frontmatter.title)}</title>\n<link>${safeUrl}</link>\n<guid>${safeUrl}</guid>\n<pubDate>${formatRfc822(post.frontmatter.publishedAt || post.frontmatter.date)}</pubDate>\n<description>${toXmlCdata(post.frontmatter.summary)}</description>\n</item>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8" ?>\n<rss version="2.0">\n<channel>\n<title>MLog (${locale.toUpperCase()})</title>\n<link>${siteUrl}/${locale}</link>\n<description>Bilingual posts feed</description>${items}\n</channel>\n</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8'
    }
  })
}

export const revalidate = 3600
