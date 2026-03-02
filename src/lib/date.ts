import type { Locale } from '@/i18n/config'

const localeMap: Record<Locale, string> = {
  zh: 'zh-CN',
  en: 'en-US'
}

export function formatDate(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(localeMap[locale], {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(new Date(date))
}

export function formatRfc822(date: string): string {
  return new Date(date).toUTCString()
}
