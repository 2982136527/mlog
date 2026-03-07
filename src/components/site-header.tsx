import Link from 'next/link'
import { Suspense } from 'react'
import type { Locale } from '@/i18n/config'
import { getDictionary } from '@/i18n/dictionaries'
import { LanguageSwitcher } from '@/components/language-switcher'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { AccountEntryLink } from '@/components/auth/account-entry-link'

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
          <Link href={`/${locale}/about`} className='transition hover:text-[var(--color-ink)]'>
            {dict.nav.about}
          </Link>
          <Link href={`/forum?locale=${locale}`} className='transition hover:text-[var(--color-ink)]'>
            {dict.nav.forum}
          </Link>
          <AccountEntryLink locale={locale} className='transition hover:text-[var(--color-ink)]' />
        </nav>
        <AccountEntryLink
          locale={locale}
          className='inline-flex rounded-full border border-white/70 bg-white/70 px-3 py-1.5 text-xs font-medium text-[var(--color-ink-soft)] shadow-sm backdrop-blur transition hover:text-[var(--color-ink)] sm:hidden'
        />
        <ThemeToggle locale={locale} />
        <Suspense
          fallback={
            <div className='inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 p-1 text-xs shadow-sm backdrop-blur'>
              <span className='rounded-full bg-[var(--color-brand)] px-3 py-1.5 font-medium text-white'>{locale.toUpperCase()}</span>
            </div>
          }>
          <LanguageSwitcher locale={locale} />
        </Suspense>
      </div>
    </header>
  )
}
