import Link from 'next/link'
import { notFound } from 'next/navigation'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getAuthSession } from '@/lib/auth'
import { formatDate } from '@/lib/date'
import { getDictionary } from '@/i18n/dictionaries'
import { resolveForumLocale, withForumLocale } from '@/lib/forum/locale'
import { getForumThreadDetail } from '@/lib/forum/service'
import { ForumShell } from '@/components/forum/forum-shell'
import { ForumReplyForm } from '@/components/forum/forum-reply-form'
import { GlassCard } from '@/components/ui/glass-card'

type ForumThreadPageProps = {
  params: Promise<{
    number: string
  }>
  searchParams: Promise<{
    locale?: string
    cursor?: string
  }>
}

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Forum Thread'
}

export default async function ForumThreadPage({ params, searchParams }: ForumThreadPageProps) {
  const [{ number: rawNumber }, query] = await Promise.all([params, searchParams])
  const locale = resolveForumLocale(query.locale)
  const dict = getDictionary(locale)
  const number = Number.parseInt(rawNumber, 10)
  if (!Number.isFinite(number) || number <= 0) {
    redirect(withForumLocale('/forum', locale))
  }

  const cursor = query.cursor?.trim() || undefined
  const detail = await getForumThreadDetail({
    number,
    cursor
  }).catch(error => {
    if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'FORUM_NOT_FOUND') {
      return null
    }
    throw error
  })
  if (!detail) {
    notFound()
  }

  if (detail.translationStatus === 'bilingual' && detail.contentLocale !== locale && detail.counterpart?.locale === locale) {
    redirect(withForumLocale(`/forum/t/${detail.counterpart.number}`, locale))
  }

  const session = await getAuthSession()
  const login = session?.user?.login?.trim()
  const hasWriteScope = Boolean(session?.user?.hasDiscussionWriteScope)

  const callbackUrl = encodeURIComponent(withForumLocale(`/forum/t/${number}`, locale))

  return (
    <ForumShell locale={locale}>
      <div className='space-y-5 py-4 sm:py-6'>
        <div className='flex flex-wrap gap-2 text-sm'>
          <Link
            href={withForumLocale('/forum', locale)}
            className='inline-flex items-center rounded-full border border-[var(--color-border-strong)] bg-white px-4 py-2 text-[var(--color-ink)] transition hover:border-[var(--color-brand)]'>
            {dict.forum.backToForum}
          </Link>
          <Link
            href={withForumLocale('/forum/new', locale)}
            className='inline-flex items-center rounded-full bg-[var(--color-brand)] px-4 py-2 font-semibold text-white transition hover:bg-[var(--color-brand-strong)]'>
            {dict.forum.newThread}
          </Link>
        </div>

        <GlassCard>
          <h1 className='font-title text-4xl leading-tight text-[var(--color-ink)]'>{detail.thread.title}</h1>
          <p className='mt-2 text-sm text-[var(--color-ink-soft)]'>
            #{detail.thread.number} · {detail.thread.author?.login || 'unknown'} · {dict.forum.createdAt}: {formatDate(detail.thread.createdAt, locale)} · {dict.forum.updatedAt}:{' '}
            {formatDate(detail.thread.updatedAt, locale)} · {dict.forum.comments}: {detail.thread.commentCount} · {dict.forum.reactions}: {detail.thread.reactionCount}
          </p>
          <div className='mt-2 flex flex-wrap gap-2'>
            <span className='rounded-full border border-[var(--color-border-strong)] bg-white px-2 py-0.5 text-xs text-[var(--color-ink-soft)]'>
              {dict.forum.contentLocale}: {detail.contentLocale === 'zh' ? dict.forum.contentLocaleZh : dict.forum.contentLocaleEn}
            </span>
            <span className='rounded-full border border-[var(--color-border-strong)] bg-white px-2 py-0.5 text-xs text-[var(--color-ink-soft)]'>
              {detail.translationStatus === 'bilingual' ? dict.forum.statusBilingual : dict.forum.statusSingle}
            </span>
            {detail.translationStatus === 'single' ? (
              <span className='rounded-full border border-[var(--color-border-strong)] bg-white px-2 py-0.5 text-xs text-[var(--color-ink-soft)]'>
                {detail.contentLocale === 'zh' ? dict.forum.singleOnlyZh : dict.forum.singleOnlyEn}
              </span>
            ) : null}
            {detail.translationStatus === 'bilingual' && detail.counterpart ? (
              <Link
                href={withForumLocale(`/forum/t/${detail.counterpart.number}`, locale)}
                className='inline-flex items-center rounded-full border border-[var(--color-border-strong)] bg-white px-2.5 py-0.5 text-xs font-medium text-[var(--color-ink)] transition hover:border-[var(--color-brand)]'>
                {detail.counterpart.locale === 'zh' ? dict.forum.switchToZh : dict.forum.switchToEn}
              </Link>
            ) : null}
          </div>
          {detail.thread.category ? (
            <p className='mt-2 text-xs text-[var(--color-ink-soft)]'>
              <Link href={withForumLocale(`/forum/c/${encodeURIComponent(detail.thread.category.slug)}`, locale)} className='underline underline-offset-2'>
                {detail.thread.category.name}
              </Link>
            </p>
          ) : null}
          <div className='mt-5 rounded-xl border border-white/70 bg-white/60 p-4'>
            <div className='prose prose-sm max-w-none whitespace-pre-wrap break-words text-[var(--color-ink)]'>{detail.thread.body}</div>
          </div>
        </GlassCard>

        <GlassCard>
          <h2 className='font-title text-3xl text-[var(--color-ink)]'>{dict.forum.comments}</h2>
          {detail.replies.length > 0 ? (
            <ul className='mt-4 space-y-3'>
              {detail.replies.map(reply => (
                <li key={reply.id} className='rounded-xl border border-white/70 bg-white/60 p-4'>
                  <p className='text-xs text-[var(--color-ink-soft)]'>
                    {reply.author?.login || 'unknown'} · {formatDate(reply.createdAt, locale)}
                  </p>
                  <div className='mt-2 whitespace-pre-wrap break-words text-sm text-[var(--color-ink)]'>{reply.body}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className='mt-3 text-sm text-[var(--color-ink-soft)]'>{dict.forum.emptyReplies}</p>
          )}
          {detail.pageInfo.hasNextPage && detail.pageInfo.endCursor ? (
            <div className='mt-4'>
              <Link
                href={withForumLocale(`/forum/t/${detail.thread.number}?cursor=${encodeURIComponent(detail.pageInfo.endCursor)}`, locale)}
                className='inline-flex items-center rounded-full border border-[var(--color-border-strong)] bg-white px-4 py-2 text-sm text-[var(--color-ink)] transition hover:border-[var(--color-brand)]'>
                {dict.forum.loadMore}
              </Link>
            </div>
          ) : null}
        </GlassCard>

        {login ? (
          <ForumReplyForm locale={locale} threadNumber={detail.thread.number} hasWriteScope={hasWriteScope} />
        ) : (
          <GlassCard>
            <p className='text-sm text-[var(--color-ink-soft)]'>{dict.forum.loginRequired}</p>
            <Link
              href={`/me/login?locale=${locale}&callbackUrl=${callbackUrl}`}
              className='mt-3 inline-flex items-center rounded-full bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-strong)]'>
              {dict.common.login}
            </Link>
          </GlassCard>
        )}
      </div>
    </ForumShell>
  )
}
