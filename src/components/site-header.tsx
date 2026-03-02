import Link from 'next/link'
import type { Locale } from '@/i18n/config'
import { getDictionary } from '@/i18n/dictionaries'
import { LanguageSwitcher } from '@/components/language-switcher'

type SiteHeaderProps = {
  locale: Locale
}

export function SiteHeader({ locale }: SiteHeaderProps) {
  const dict = getDictionary(locale)

  return (
    <header className='mx-auto flex w-full max-w-6xl items-center justify-between px-5 pt-6 pb-3 sm:px-8 sm:pt-8'>
      <div>
        <Link href={`/${locale}`} className='font-title text-3xl leading-none tracking-tight text-[var(--color-ink)]'>
          {dict.siteName}
        </Link>
        <p className='mt-1 text-sm text-[var(--color-ink-soft)]'>{dict.siteTagline}</p>
      </div>

      <div className='flex items-center gap-3'>
        <nav className='hidden items-center gap-4 text-sm font-medium text-[var(--color-ink-soft)] sm:flex'>
          <Link href={`/${locale}`} className='transition hover:text-[var(--color-ink)]'>
            {dict.nav.home}
          </Link>
          <Link href={`/${locale}/blog`} className='transition hover:text-[var(--color-ink)]'>
            {dict.nav.blog}
          </Link>
        </nav>
        <LanguageSwitcher locale={locale} />
      </div>
    </header>
  )
}
