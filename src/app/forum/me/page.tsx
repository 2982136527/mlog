import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getAuthSession } from '@/lib/auth'
import { getDictionary } from '@/i18n/dictionaries'
import { formatDate } from '@/lib/date'
import { resolveForumLocale, withForumLocale } from '@/lib/forum/locale'
import { getForumMe } from '@/lib/forum/service'
import { ForumShell } from '@/components/forum/forum-shell'
import { GlassCard } from '@/components/ui/glass-card'
import { SectionTitle } from '@/components/ui/section-title'

type ForumMePageProps = {
  searchParams: Promise<{
    locale?: string
  }>
}

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'My Forum'
}

export default async function ForumMePage({ searchParams }: ForumMePageProps) {
  const query = await searchParams
  const locale = resolveForumLocale(query.locale)
  const dict = getDictionary(locale)
  const session = await getAuthSession()
  const login = session?.user?.login?.trim()

  if (!login) {
    redirect(`/me/login?locale=${locale}&callbackUrl=${encodeURIComponent(withForumLocale('/forum/me', locale))}`)
  }

  const payload = await getForumMe({ login })

  return (
    <ForumShell locale={locale}>
      <div className='space-y-5 py-4 sm:py-6'>
        <GlassCard>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div>
              <h1 className='font-title text-4xl text-[var(--color-ink)]'>{dict.forum.myForum}</h1>
              <p className='mt-2 text-sm text-[var(--color-ink-soft)]'>@{login}</p>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Link
                href={withForumLocale('/forum', locale)}
                className='inline-flex items-center rounded-full border border-[var(--color-border-strong)] bg-white px-4 py-2 text-sm text-[var(--color-ink)] transition hover:border-[var(--color-brand)]'>
                {dict.forum.backToForum}
              </Link>
              <Link
                href={withForumLocale('/forum/new', locale)}
                className='inline-flex items-center rounded-full bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-strong)]'>
                {dict.forum.newThread}
              </Link>
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <SectionTitle>{dict.forum.myThreads}</SectionTitle>
          {payload.threads.length > 0 ? (
            <ul className='mt-4 space-y-3'>
              {payload.threads.map(item => (
                <li key={item.id} className='rounded-xl border border-white/70 bg-white/60 p-3'>
                  <Link
                    href={withForumLocale(`/forum/t/${item.number}`, locale)}
                    className='text-base font-semibold text-[var(--color-ink)] transition hover:text-[var(--color-brand)]'>
                    {item.title}
                  </Link>
                  <p className='mt-2 text-xs text-[var(--color-ink-soft)]'>
                    #{item.number} · {dict.forum.updatedAt}: {formatDate(item.updatedAt, locale)} · {dict.forum.comments}: {item.commentCount}
                  </p>
                  <div className='mt-2 flex flex-wrap gap-2'>
                    <span className='rounded-full border border-[var(--color-border-strong)] bg-white px-2 py-0.5 text-[11px] text-[var(--color-ink-soft)]'>
                      {dict.forum.contentLocale}: {item.contentLocale === 'zh' ? dict.forum.contentLocaleZh : dict.forum.contentLocaleEn}
                    </span>
                    <span className='rounded-full border border-[var(--color-border-strong)] bg-white px-2 py-0.5 text-[11px] text-[var(--color-ink-soft)]'>
                      {item.translationStatus === 'bilingual' ? dict.forum.statusBilingual : dict.forum.statusSingle}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className='mt-3 text-sm text-[var(--color-ink-soft)]'>{dict.forum.emptyThreads}</p>
          )}
        </GlassCard>

        <GlassCard>
          <SectionTitle>{dict.forum.myReplies}</SectionTitle>
          {payload.replies.length > 0 ? (
            <ul className='mt-4 space-y-3'>
              {payload.replies.map(item => (
                <li key={item.id} className='rounded-xl border border-white/70 bg-white/60 p-3'>
                  <Link
                    href={withForumLocale(`/forum/t/${item.threadNumber}`, locale)}
                    className='text-base font-semibold text-[var(--color-ink)] transition hover:text-[var(--color-brand)]'>
                    {item.threadTitle}
                  </Link>
                  <p className='mt-2 line-clamp-2 text-sm text-[var(--color-ink-soft)]'>{item.bodyText}</p>
                  <p className='mt-1 text-xs text-[var(--color-ink-soft)]'>
                    #{item.threadNumber} · {formatDate(item.createdAt, locale)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className='mt-3 text-sm text-[var(--color-ink-soft)]'>{dict.forum.emptyReplies}</p>
          )}
        </GlassCard>
      </div>
    </ForumShell>
  )
}
