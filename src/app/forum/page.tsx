import Link from 'next/link'
import type { Metadata } from 'next'
import { getDictionary } from '@/i18n/dictionaries'
import { formatDate } from '@/lib/date'
import { resolveForumLocale, withForumLocale } from '@/lib/forum/locale'
import { listForumThreads } from '@/lib/forum/service'
import { ForumShell } from '@/components/forum/forum-shell'
import { GlassCard } from '@/components/ui/glass-card'
import { SectionTitle } from '@/components/ui/section-title'

type ForumPageProps = {
  searchParams: Promise<{
    locale?: string
    q?: string
    cursor?: string
  }>
}

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Forum'
}

export default async function ForumPage({ searchParams }: ForumPageProps) {
  const params = await searchParams
  const locale = resolveForumLocale(params.locale)
  const dict = getDictionary(locale)
  const searchLabel = locale === 'zh' ? '搜索' : 'Search'
  const q = params.q?.trim() || ''
  const cursor = params.cursor?.trim() || undefined

  const payload = await listForumThreads({
    q,
    cursor
  })

  const hotItems = [...payload.items]
    .sort((a, b) => b.commentCount + b.reactionCount - (a.commentCount + a.reactionCount))
    .slice(0, 6)

  return (
    <ForumShell locale={locale}>
      <div className='space-y-6 py-4 sm:py-6'>
        <GlassCard>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div>
              <h1 className='font-title text-4xl text-[var(--color-ink)]'>{dict.forum.title}</h1>
              <p className='mt-2 text-sm text-[var(--color-ink-soft)]'>{dict.forum.description}</p>
            </div>
            <Link
              href={withForumLocale('/forum/new', locale)}
              className='inline-flex items-center rounded-full bg-[var(--color-brand)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-strong)]'>
              {dict.forum.newThread}
            </Link>
          </div>
        </GlassCard>

        <form method='get' className='rounded-2xl border border-white/60 bg-white/60 p-4 backdrop-blur'>
          <input type='hidden' name='locale' value={locale} />
          <div className='flex flex-wrap gap-3'>
            <input
              name='q'
              defaultValue={q}
              placeholder={dict.forum.searchPlaceholder}
              className='min-w-[220px] flex-1 rounded-xl border border-[var(--color-border-strong)] bg-white/70 px-3 py-2 text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-brand)]'
            />
            <button
              type='submit'
              className='inline-flex items-center rounded-full bg-[var(--color-brand)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-strong)]'>
              {searchLabel}
            </button>
          </div>
        </form>

        <div className='grid gap-4 lg:grid-cols-3'>
          <GlassCard className='lg:col-span-1'>
            <SectionTitle>{dict.forum.categories}</SectionTitle>
            {payload.categories.length > 0 ? (
              <ul className='mt-4 space-y-2'>
                {payload.categories.map(item => (
                  <li key={item.id}>
                    <Link
                      href={withForumLocale(`/forum/c/${encodeURIComponent(item.slug)}`, locale)}
                      className='block rounded-xl border border-white/70 bg-white/60 px-3 py-2 text-sm text-[var(--color-ink)] transition hover:border-[var(--color-brand)]'>
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className='mt-3 text-sm text-[var(--color-ink-soft)]'>{dict.forum.noCategories}</p>
            )}
          </GlassCard>

          <GlassCard className='lg:col-span-2'>
            <SectionTitle>{dict.forum.latestThreads}</SectionTitle>
            {payload.items.length > 0 ? (
              <ul className='mt-4 space-y-3'>
                {payload.items.map(item => (
                  <li key={item.id} className='rounded-xl border border-white/70 bg-white/60 p-3'>
                    <Link
                      href={withForumLocale(`/forum/t/${item.number}`, locale)}
                      className='text-base font-semibold text-[var(--color-ink)] transition hover:text-[var(--color-brand)]'>
                      {item.title}
                    </Link>
                    <p className='mt-1 line-clamp-2 text-sm text-[var(--color-ink-soft)]'>{item.bodyText}</p>
                    <p className='mt-2 text-xs text-[var(--color-ink-soft)]'>
                      #{item.number} · {item.author?.login || 'unknown'} · {dict.forum.updatedAt}: {formatDate(item.updatedAt, locale)} · {dict.forum.comments}:{' '}
                      {item.commentCount} · {dict.forum.reactions}: {item.reactionCount}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className='mt-3 text-sm text-[var(--color-ink-soft)]'>{dict.forum.emptyThreads}</p>
            )}
            {payload.pageInfo.hasNextPage && payload.pageInfo.endCursor ? (
              <div className='mt-4'>
                <Link
                  href={withForumLocale(`/forum?cursor=${encodeURIComponent(payload.pageInfo.endCursor)}${q ? `&q=${encodeURIComponent(q)}` : ''}`, locale)}
                  className='inline-flex items-center rounded-full border border-[var(--color-border-strong)] bg-white px-4 py-2 text-sm text-[var(--color-ink)] transition hover:border-[var(--color-brand)]'>
                  {dict.forum.loadMore}
                </Link>
              </div>
            ) : null}
          </GlassCard>
        </div>

        <GlassCard>
          <SectionTitle>{dict.forum.hotThreads}</SectionTitle>
          {hotItems.length > 0 ? (
            <ul className='mt-4 grid gap-3 sm:grid-cols-2'>
              {hotItems.map(item => (
                <li key={`hot-${item.id}`} className='rounded-xl border border-white/70 bg-white/60 p-3'>
                  <Link
                    href={withForumLocale(`/forum/t/${item.number}`, locale)}
                    className='text-sm font-semibold text-[var(--color-ink)] transition hover:text-[var(--color-brand)]'>
                    {item.title}
                  </Link>
                  <p className='mt-2 text-xs text-[var(--color-ink-soft)]'>
                    {dict.forum.comments}: {item.commentCount} · {dict.forum.reactions}: {item.reactionCount}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className='mt-3 text-sm text-[var(--color-ink-soft)]'>{dict.forum.emptyThreads}</p>
          )}
        </GlassCard>
      </div>
    </ForumShell>
  )
}
