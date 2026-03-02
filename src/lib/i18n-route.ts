import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/i18n/config'

export function resolveLocaleOr404(input: string): Locale {
  if (!isLocale(input)) {
    notFound()
  }
  return input
}
