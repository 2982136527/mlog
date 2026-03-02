import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { Locale } from '@/i18n/config'
import { isLocale } from '@/i18n/config'
import { getDictionary } from '@/i18n/dictionaries'
import { getCategoryCounts, getLatestPost } from '@/lib/content'
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
  const categories = getCategoryCounts(locale)

  return <HomeCards locale={locale as Locale} latestPost={latestPost} categories={categories} />
}
