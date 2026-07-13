import type { MetadataRoute } from 'next'
import { defaultLocale, locales } from '@/i18n/config'
import { getAllPostsAsync } from '@/lib/content'
import { getSiteUrl } from '@/lib/site'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl()
  const now = new Date()

  const staticPages: MetadataRoute.Sitemap = locales.flatMap(locale => [
    {
      url: `${siteUrl}/${locale}`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1
    },
    {
      url: `${siteUrl}/${locale}/about`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7
    },
    {
      url: `${siteUrl}/${locale}/blog`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8
    }
  ])
  staticPages.push({
    url: `${siteUrl}/forum`,
    lastModified: now,
    changeFrequency: 'daily',
    priority: 0.7
  })

  const posts = await getAllPostsAsync()
  const slugs = Array.from(new Set(posts.map(post => post.slug))).sort((a, b) => a.localeCompare(b))
  const postPages: MetadataRoute.Sitemap = locales.flatMap(locale => {
    return slugs
      .map(slug => {
        const post = posts.find(item => item.slug === slug && item.locale === locale)
          ?? (locale === defaultLocale ? null : posts.find(item => item.slug === slug && item.locale === defaultLocale))
        if (!post) {
          return null
        }

        return {
          url: `${siteUrl}/${locale}/blog/${slug}`,
          lastModified: new Date(post.frontmatter.updated || post.frontmatter.publishedAt || post.frontmatter.date),
          changeFrequency: 'weekly' as const,
          priority: 0.7
        }
      })
      .filter(Boolean) as MetadataRoute.Sitemap
  })

  return [...staticPages, ...postPages]
}

export const revalidate = 60
