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

export function getDateIsoInTimeZone(now = new Date(), timeZone = 'Asia/Shanghai'): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}
