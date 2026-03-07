'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { locales, type Locale } from '@/i18n/config'
import { cn } from '@/lib/utils'

type LanguageSwitcherProps = {
  locale: Locale
}

function replaceLocaleInPath(pathname: string, targetLocale: Locale): string {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) {
    return `/${targetLocale}`
  }

  if (locales.includes(segments[0] as Locale)) {
    segments[0] = targetLocale
  } else {
    segments.unshift(targetLocale)
  }

  return `/${segments.join('/')}`
}

export function LanguageSwitcher({ locale }: LanguageSwitcherProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  return (
    <div className='inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 p-1 text-xs shadow-sm backdrop-blur'>
      {locales.map(targetLocale => {
        const isForumPath = pathname.startsWith('/forum')
        const href = (() => {
          if (!isForumPath) {
            return replaceLocaleInPath(pathname, targetLocale)
          }

          const nextParams = new URLSearchParams(searchParams.toString())
          nextParams.set('locale', targetLocale)
          const currentContentLocale = nextParams.get('contentLocale')
          if (!currentContentLocale || currentContentLocale === locale) {
            nextParams.set('contentLocale', targetLocale)
          }
          return `${pathname}?${nextParams.toString()}`
        })()

        return (
          <Link
            key={targetLocale}
            href={href}
            className={cn(
              'rounded-full px-3 py-1.5 font-medium transition',
              locale === targetLocale ? 'bg-[var(--color-brand)] text-white' : 'text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
            )}>
            {targetLocale.toUpperCase()}
          </Link>
        )
      })}
    </div>
  )
}
