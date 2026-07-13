import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { Locale } from '@/i18n/config'
import { isLocale } from '@/i18n/config'
import { getDictionary } from '@/i18n/dictionaries'
import { getCategoryCountsAsync, getLatestPostAsync, getTagCountsAsync } from '@/lib/content'
import { createLocaleMetadata } from '@/lib/metadata'
import { HomeCards } from '@/components/home/home-cards'
import { isAllowedPublicMediaUrl } from '@/lib/media/public-url'

type LocaleHomeProps = {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: LocaleHomeProps): Promise<Metadata> {
  const { locale } = await params

  if (!isLocale(locale)) {
    return {}
  }

  const dict = getDictionary(locale)
  return createLocaleMetadata({
    locale,
    title: dict.siteName,
    description: dict.siteTagline,
    path: `/${locale}`
  })
}

export default async function LocaleHomePage({ params }: LocaleHomeProps) {
  const { locale } = await params

  if (!isLocale(locale)) {
    notFound()
  }

  const [latestPost, categories, tagCounts] = await Promise.all([
    getLatestPostAsync(locale),
    getCategoryCountsAsync(locale),
    getTagCountsAsync(locale)
  ])
  const latestPostCard = latestPost
    ? {
        slug: latestPost.slug,
        frontmatter: {
          title: latestPost.frontmatter.title,
          summary: latestPost.frontmatter.summary,
          date: latestPost.frontmatter.date,
          cover: isAllowedPublicMediaUrl(latestPost.frontmatter.cover) ? latestPost.frontmatter.cover : undefined
        }
      }
    : null
  return <HomeCards locale={locale as Locale} latestPost={latestPostCard} categories={categories} tagCounts={tagCounts} />
}

export const revalidate = 60
