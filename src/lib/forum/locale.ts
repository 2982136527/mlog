import type { Locale } from '@/i18n/config'

export function resolveForumLocale(input: string | null | undefined): Locale {
  return input === 'en' ? 'en' : 'zh'
}

export function withForumLocale(path: string, locale: Locale): string {
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}locale=${locale}`
}
