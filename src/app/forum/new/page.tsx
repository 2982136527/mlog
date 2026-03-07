import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getAuthSession } from '@/lib/auth'
import { getDictionary } from '@/i18n/dictionaries'
import { resolveForumLocale, withForumLocale } from '@/lib/forum/locale'
import { listForumCategories } from '@/lib/forum/service'
import { ForumShell } from '@/components/forum/forum-shell'
import { ForumThreadForm } from '@/components/forum/forum-thread-form'

type ForumNewPageProps = {
  searchParams: Promise<{
    locale?: string
  }>
}

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'New Thread'
}

export default async function ForumNewPage({ searchParams }: ForumNewPageProps) {
  const query = await searchParams
  const locale = resolveForumLocale(query.locale)
  const dict = getDictionary(locale)
  const session = await getAuthSession()
  const login = session?.user?.login?.trim()

  if (!login) {
    redirect(`/me/login?locale=${locale}&callbackUrl=${encodeURIComponent(withForumLocale('/forum/new', locale))}`)
  }

  const categories = await listForumCategories()

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
            href={withForumLocale('/forum/me', locale)}
            className='inline-flex items-center rounded-full border border-[var(--color-border-strong)] bg-white px-4 py-2 text-[var(--color-ink)] transition hover:border-[var(--color-brand)]'>
            {dict.forum.myForum}
          </Link>
        </div>
        <ForumThreadForm
          locale={locale}
          categories={categories}
          hasWriteScope={Boolean(session?.user?.hasDiscussionWriteScope)}
          hasGistScope={Boolean(session?.user?.hasGistScope)}
        />
      </div>
    </ForumShell>
  )
}
