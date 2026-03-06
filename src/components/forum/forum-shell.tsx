import type { Locale } from '@/i18n/config'
import { BlurGradientBackground } from '@/components/background/blur-gradient-background'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'

type ForumShellProps = {
  locale: Locale
  children: React.ReactNode
}

export function ForumShell({ locale, children }: ForumShellProps) {
  return (
    <div className='relative min-h-screen pb-8' data-locale={locale} data-theme-scope='public'>
      <BlurGradientBackground />
      <SiteHeader locale={locale} />
      <main className='mx-auto w-full max-w-6xl px-5 sm:px-8'>{children}</main>
      <SiteFooter locale={locale} />
    </div>
  )
}
