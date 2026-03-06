import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthSession } from '@/lib/auth'
import { AdminHttpError } from '@/lib/admin/errors'
import { listCommentActivity, listReadHistory } from '@/lib/user/activity-service'
import type { UserCommentActivityItem, UserReadHistoryItem } from '@/types/user-activity'

function formatDateTime(value: string): string {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) {
    return value
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp))
}

type PostLinkItemProps =
  | {
      type: 'view'
      item: UserReadHistoryItem
    }
  | {
      type: 'comment'
      item: UserCommentActivityItem
    }

function PostLinkItem({ item, type }: PostLinkItemProps) {
  const href = `/${item.locale}/blog/${item.slug}`
  const count = type === 'view' ? item.viewCount : item.interactionCount
  const latestAt = type === 'view' ? item.lastViewedAt : item.lastInteractedAt
  const countLabel = type === 'view' ? '浏览次数' : '交互次数'
  const latestLabel = type === 'view' ? '最近浏览' : '最近交互'

  return (
    <li className='rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-3 text-sm'>
      <Link href={href} className='font-medium text-[var(--color-ink)] transition hover:text-[var(--color-brand)]'>
        {item.title}
      </Link>
      <p className='mt-1 text-xs text-[var(--color-ink-soft)]'>
        {item.locale.toUpperCase()} · {item.slug}
      </p>
      <p className='mt-1 text-xs text-[var(--color-ink-soft)]'>
        {countLabel}: {count} · {latestLabel}: {formatDateTime(latestAt)}
      </p>
    </li>
  )
}

export default async function MePage() {
  const session = await getAuthSession()
  const login = session?.user?.login?.trim()

  if (!session?.user || !login) {
    redirect('/me/login?callbackUrl=/me')
  }

  let readHistory: UserReadHistoryItem[] = []
  let commentHistory: UserCommentActivityItem[] = []
  let loadError: string | null = null

  try {
    ;[readHistory, commentHistory] = await Promise.all([listReadHistory(login, 30), listCommentActivity(login, 30)])
  } catch (error) {
    if (error instanceof AdminHttpError) {
      loadError = error.message
    } else {
      loadError = '读取用户记录失败，请稍后重试。'
    }
  }

  return (
    <div className='mx-auto max-w-6xl space-y-5 px-5 pt-8 pb-10 sm:px-8'>
      <header className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='font-title text-4xl text-[var(--color-ink)]'>我的</h1>
          <p className='text-sm text-[var(--color-ink-soft)]'>当前用户：@{login}</p>
        </div>
        <div className='flex flex-wrap gap-2 text-sm'>
          <Link href='/' className='rounded-xl border border-[var(--color-border-strong)] bg-white px-4 py-2 text-[var(--color-ink-soft)] transition hover:text-[var(--color-ink)]'>
            返回前台
          </Link>
          <Link href='/api/auth/signout?callbackUrl=/' className='rounded-xl border border-[var(--color-border-strong)] bg-white px-4 py-2 text-[var(--color-ink-soft)] transition hover:text-[var(--color-ink)]'>
            退出登录
          </Link>
        </div>
      </header>

      {loadError ? <p className='rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>{loadError}</p> : null}

      <section className='rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur'>
        <h2 className='font-title text-2xl text-[var(--color-ink)]'>最近阅读历史</h2>
        {readHistory.length === 0 ? (
          <p className='mt-2 text-sm text-[var(--color-ink-soft)]'>暂无记录。</p>
        ) : (
          <ul className='mt-3 space-y-2'>
            {readHistory.map(item => (
              <PostLinkItem key={`${item.locale}:${item.slug}`} item={item} type='view' />
            ))}
          </ul>
        )}
      </section>

      <section className='rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur'>
        <h2 className='font-title text-2xl text-[var(--color-ink)]'>最近评论交互</h2>
        {commentHistory.length === 0 ? (
          <p className='mt-2 text-sm text-[var(--color-ink-soft)]'>暂无记录。</p>
        ) : (
          <ul className='mt-3 space-y-2'>
            {commentHistory.map(item => (
              <PostLinkItem key={`${item.locale}:${item.slug}`} item={item} type='comment' />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
