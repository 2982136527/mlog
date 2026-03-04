import type { MetadataRoute } from 'next'
import { locales } from '@/i18n/config'
import { getAllSlugs, getLocalizedPost } from '@/lib/content'
import { getSiteUrl } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
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

  const slugs = getAllSlugs()
  const postPages: MetadataRoute.Sitemap = locales.flatMap(locale => {
    return slugs
      .map(slug => {
        const post = getLocalizedPost(locale, slug)
        if (!post) {
          return null
        }

        return {
          url: `${siteUrl}/${locale}/blog/${slug}`,
          lastModified: post.frontmatter.updated ? new Date(post.frontmatter.updated) : new Date(post.frontmatter.date),
          changeFrequency: 'weekly' as const,
          priority: 0.7
        }
      })
      .filter(Boolean) as MetadataRoute.Sitemap
  })

  return [...staticPages, ...postPages]
}
