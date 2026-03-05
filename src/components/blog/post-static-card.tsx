import type { Locale } from '@/i18n/config'
import { getDictionary } from '@/i18n/dictionaries'
import type { PostStaticSnapshot } from '@/types/repo-cards'

type PostStaticCardProps = {
  locale: Locale
  snapshot: PostStaticSnapshot | null
}

const localeMap: Record<Locale, string> = {
  zh: 'zh-CN',
  en: 'en-US'
}

function toDateLabel(value: string | null, locale: Locale): string {
  if (!value) {
    return '—'
  }

  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) {
    return '—'
  }

  return new Intl.DateTimeFormat(localeMap[locale], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp))
}

function toNumberLabel(value: number | null, locale: Locale): string {
  if (value === null || !Number.isFinite(value)) {
    return '—'
  }

  return new Intl.NumberFormat(localeMap[locale]).format(value)
}

export function PostStaticCard({ locale, snapshot }: PostStaticCardProps) {
  const dict = getDictionary(locale)

  return (
    <section className='rounded-2xl border border-white/60 bg-white/55 p-4 text-[var(--color-ink)] shadow-[0_16px_42px_-30px_rgba(120,45,20,0.45)] backdrop-blur sm:p-5'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h2 className='font-title text-2xl'>{dict.blog.staticCardTitle}</h2>
        <span className='text-xs text-[var(--color-ink-soft)]'>{dict.blog.staticCardSource}: Publish Baseline</span>
      </div>

      {snapshot?.repoUrl ? (
        <p className='mt-2 break-all text-sm text-[var(--color-ink-soft)]'>
          {dict.blog.staticCardRepo}:{' '}
          <a href={snapshot.repoUrl} target='_blank' rel='noreferrer' className='transition hover:text-[var(--color-brand)]'>
            {snapshot.repoFullName || snapshot.repoUrl}
          </a>
        </p>
      ) : (
        <p className='mt-2 text-sm text-[var(--color-ink-soft)]'>{dict.blog.staticCardUnavailable}</p>
      )}

      <div className='mt-4 grid gap-3 sm:grid-cols-2'>
        <div className='rounded-xl border border-white/60 bg-white/65 px-4 py-3'>
          <p className='text-xs text-[var(--color-ink-soft)]'>{dict.blog.staticCardStars}</p>
          <p className='mt-1 text-xl font-semibold'>{toNumberLabel(snapshot?.stars ?? null, locale)}</p>
        </div>
        <div className='rounded-xl border border-white/60 bg-white/65 px-4 py-3'>
          <p className='text-xs text-[var(--color-ink-soft)]'>{dict.blog.staticCardForks}</p>
          <p className='mt-1 text-xl font-semibold'>{toNumberLabel(snapshot?.forks ?? null, locale)}</p>
        </div>
        <div className='rounded-xl border border-white/60 bg-white/65 px-4 py-3 sm:col-span-2'>
          <p className='text-xs text-[var(--color-ink-soft)]'>{dict.blog.staticCardOpenIssues}</p>
          <p className='mt-1 text-xl font-semibold'>{toNumberLabel(snapshot?.openIssues ?? null, locale)}</p>
        </div>
      </div>

      <div className='mt-4 text-xs text-[var(--color-ink-soft)]'>
        <p>
          {dict.blog.staticCardSnapshotAt}: {toDateLabel(snapshot?.snapshotAt ?? null, locale)}
        </p>
      </div>
    </section>
  )
}
