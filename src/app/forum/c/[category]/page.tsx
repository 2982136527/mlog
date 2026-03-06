import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getDictionary } from '@/i18n/dictionaries'
import { formatDate } from '@/lib/date'
import { resolveForumLocale, withForumLocale } from '@/lib/forum/locale'
import { listForumThreads } from '@/lib/forum/service'
import { ForumShell } from '@/components/forum/forum-shell'
import { GlassCard } from '@/components/ui/glass-card'
import { SectionTitle } from '@/components/ui/section-title'

type ForumCategoryPageProps = {
  params: Promise<{
    category: string
  }>
  searchParams: Promise<{
    locale?: string
    q?: string
    cursor?: string
  }>
}

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Forum Category'
}

export default async function ForumCategoryPage({ params, searchParams }: ForumCategoryPageProps) {
  const [{ category }, query] = await Promise.all([params, searchParams])
  const locale = resolveForumLocale(query.locale)
  const dict = getDictionary(locale)
  const searchLabel = locale === 'zh' ? '搜索' : 'Search'
  const q = query.q?.trim() || ''
  const cursor = query.cursor?.trim() || undefined

  const payload = await listForumThreads({
    categorySlug: decodeURIComponent(category),
    q,
    cursor
  }).catch(error => {
    if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'FORUM_NOT_FOUND') {
      return null
    }
    throw error
  })

  if (!payload || !payload.category) {
    notFound()
  }

  return (
    <ForumShell locale={locale}>
      <div className='space-y-5 py-4 sm:py-6'>
        <GlassCard>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div>
              <h1 className='font-title text-4xl text-[var(--color-ink)]'>
                {dict.forum.categories} · {payload.category.name}
              </h1>
              <p className='mt-2 text-sm text-[var(--color-ink-soft)]'>{payload.category.description || dict.forum.description}</p>
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

        <GlassCard>
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
                href={withForumLocale(
                  `/forum/c/${encodeURIComponent(payload.category.slug)}?cursor=${encodeURIComponent(payload.pageInfo.endCursor)}${q ? `&q=${encodeURIComponent(q)}` : ''}`,
                  locale
                )}
                className='inline-flex items-center rounded-full border border-[var(--color-border-strong)] bg-white px-4 py-2 text-sm text-[var(--color-ink)] transition hover:border-[var(--color-brand)]'>
                {dict.forum.loadMore}
              </Link>
            </div>
          ) : null}
        </GlassCard>
      </div>
    </ForumShell>
  )
}
