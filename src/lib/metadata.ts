import type { Metadata } from 'next'
import type { Locale } from '@/i18n/config'
import { defaultLocale } from '@/i18n/config'
import { getSiteUrl, siteMeta } from '@/lib/site'
import { toAbsolutePublicMediaUrl } from '@/lib/media/public-url'

function descriptionByLocale(locale: Locale): string {
  return locale === 'zh' ? siteMeta.descriptionZh : siteMeta.descriptionEn
}

export function createLocaleMetadata(params: {
  locale: Locale
  title: string
  description?: string
  path: string
  image?: string
}): Metadata {
  const siteUrl = getSiteUrl()
  const description = params.description ?? descriptionByLocale(params.locale)
  const canonical = `${siteUrl}${params.path}`
  const zhPath = params.path.replace(/^\/(zh|en)/, '/zh')
  const enPath = params.path.replace(/^\/(zh|en)/, '/en')
  const image = toAbsolutePublicMediaUrl(params.image, siteUrl)

  return {
    title: params.title,
    description,
    alternates: {
      canonical,
      languages: {
        'zh-CN': `${siteUrl}${zhPath}`,
        'en-US': `${siteUrl}${enPath}`,
        'x-default': `${siteUrl}/${defaultLocale}`
      }
    },
    openGraph: {
      title: params.title,
      description,
      url: canonical,
      siteName: siteMeta.name,
      type: 'article',
      ...(image ? { images: [{ url: image, alt: params.title }] } : {})
    },
    twitter: {
      card: 'summary_large_image',
      title: params.title,
      description,
      ...(image ? { images: [image] } : {})
    }
  }
}
