import { notFound } from 'next/navigation'
import type { Locale } from '@/i18n/config'
import { isLocale, locales } from '@/i18n/config'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { BlurGradientBackground } from '@/components/background/blur-gradient-background'

type LocaleLayoutProps = {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}

export function generateStaticParams() {
  return locales.map(locale => ({ locale }))
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params

  if (!isLocale(locale)) {
    notFound()
  }

  return (
    <div className='relative min-h-screen pb-8' data-locale={locale}>
      <BlurGradientBackground />
      <SiteHeader locale={locale as Locale} />
      <main className='mx-auto w-full max-w-6xl px-5 sm:px-8'>{children}</main>
      <SiteFooter locale={locale as Locale} />
    </div>
  )
}
