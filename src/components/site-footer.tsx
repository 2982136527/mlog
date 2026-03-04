import type { Locale } from '@/i18n/config'
import { getDictionary } from '@/i18n/dictionaries'
import { getFooterStats } from '@/lib/analytics/footer-stats'

type SiteFooterProps = {
  locale: Locale
}

function getLocaleTag(locale: Locale): string {
  return locale === 'zh' ? 'zh-CN' : 'en-US'
}

function formatCount(locale: Locale, value: number | null): string {
  if (value === null) {
    return '—'
  }

  return new Intl.NumberFormat(getLocaleTag(locale)).format(Math.max(0, Math.round(value)))
}

function formatAvgReadDuration(locale: Locale, value: number | null): string {
  if (value === null || !Number.isFinite(value) || value <= 0) {
    return '—'
  }

  const rounded = Math.round(value)

  if (rounded >= 3600) {
    const hours = Math.floor(rounded / 3600)
    const minutes = Math.floor((rounded % 3600) / 60)
    return locale === 'zh' ? `${hours}小时 ${minutes}分钟` : `${hours}h ${minutes}m`
  }

  const minutes = Math.floor(rounded / 60)
  const seconds = rounded % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export async function SiteFooter({ locale }: SiteFooterProps) {
  const dict = getDictionary(locale)
  const stats = await getFooterStats()
  const hasStats = stats.visitors !== null || stats.pageviews !== null || stats.avgReadSeconds !== null

  return (
    <footer className='mx-auto mt-16 w-full max-w-6xl px-5 pb-10 text-xs text-[var(--color-ink-soft)] sm:px-8'>
      <div className='rounded-2xl border border-white/60 bg-white/40 px-4 py-3 backdrop-blur'>
        <p>© {new Date().getFullYear()} {dict.siteName}.</p>
        <div className='mt-3 grid gap-2 sm:grid-cols-4'>
          <p>
            {dict.footer.visitors}: <span className='font-semibold text-[var(--color-ink)]'>{formatCount(locale, stats.visitors)}</span>
          </p>
          <p>
            {dict.footer.pageviews}: <span className='font-semibold text-[var(--color-ink)]'>{formatCount(locale, stats.pageviews)}</span>
          </p>
          <p>
            {dict.footer.avgReadTime}: <span className='font-semibold text-[var(--color-ink)]'>{formatAvgReadDuration(locale, stats.avgReadSeconds)}</span>
          </p>
          <p>
            {dict.footer.siteSince}: <span className='font-semibold text-[var(--color-ink)]'>{stats.startDate}</span>
          </p>
        </div>
        {stats.scope === 'site' && hasStats ? <p className='mt-2 text-[11px]'>{dict.footer.statsFallbackSiteWide}</p> : null}
      </div>
    </footer>
  )
}
