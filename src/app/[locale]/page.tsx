import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { Locale } from '@/i18n/config'
import { isLocale } from '@/i18n/config'
import { getDictionary } from '@/i18n/dictionaries'
import { getCategoryCounts, getLatestPost, getTagCounts } from '@/lib/content'
import { createLocaleMetadata } from '@/lib/metadata'
import { HomeCards } from '@/components/home/home-cards'

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

  const latestPost = getLatestPost(locale)
  const latestPostCard = latestPost
    ? {
        slug: latestPost.slug,
        frontmatter: {
          title: latestPost.frontmatter.title,
          summary: latestPost.frontmatter.summary,
          date: latestPost.frontmatter.date
        }
      }
    : null
  const categories = getCategoryCounts(locale)
  const tagCounts = getTagCounts(locale)

  return <HomeCards locale={locale as Locale} latestPost={latestPostCard} categories={categories} tagCounts={tagCounts} />
}
