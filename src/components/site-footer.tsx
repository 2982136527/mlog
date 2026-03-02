import type { Locale } from '@/i18n/config'
import { getDictionary } from '@/i18n/dictionaries'

type SiteFooterProps = {
  locale: Locale
}

export function SiteFooter({ locale }: SiteFooterProps) {
  const dict = getDictionary(locale)

  return (
    <footer className='mx-auto mt-16 w-full max-w-6xl px-5 pb-10 text-xs text-[var(--color-ink-soft)] sm:px-8'>
      <div className='rounded-2xl border border-white/60 bg-white/40 px-4 py-3 backdrop-blur'>
        <p>© {new Date().getFullYear()} {dict.siteName}.</p>
      </div>
    </footer>
  )
}
