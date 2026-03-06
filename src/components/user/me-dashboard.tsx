'use client'

import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { useEffect, useMemo, useState } from 'react'
import {
  getLocalHistoryStore,
  getPendingCount,
  mergeCloudHistoryIntoLocal,
  subscribeLocalHistoryUpdated,
  syncLocalHistoryToCloud
} from '@/lib/user-history/client'
import type { UserHistoryItem, UserHistoryPayload } from '@/types/user-history'

type MeDashboardProps = {
  login: string
  hasGistScope: boolean
}

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

function PostLinkItem({ item, kind }: { item: UserHistoryItem; kind: 'read' | 'comment' }) {
  const href = `/${item.locale}/blog/${item.slug}`
  const countLabel = kind === 'read' ? '浏览次数' : '交互次数'
  const latestLabel = kind === 'read' ? '最近浏览' : '最近交互'

  return (
    <li className='rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-3 text-sm'>
      <Link href={href} className='font-medium text-[var(--color-ink)] transition hover:text-[var(--color-brand)]'>
        {item.title}
      </Link>
      <p className='mt-1 text-xs text-[var(--color-ink-soft)]'>
        {item.locale.toUpperCase()} · {item.slug}
      </p>
      <p className='mt-1 text-xs text-[var(--color-ink-soft)]'>
        {countLabel}: {item.count} · {latestLabel}: {formatDateTime(item.lastAt)}
      </p>
    </li>
  )
}

export function MeDashboard({ login, hasGistScope }: MeDashboardProps) {
  const [history, setHistory] = useState<UserHistoryPayload>(() => getLocalHistoryStore().history)
  const [pendingCount, setPendingCount] = useState<number>(() => getPendingCount())
  const [syncing, setSyncing] = useState(false)
  const [cloudEnabled, setCloudEnabled] = useState(hasGistScope)
  const [syncedAt, setSyncedAt] = useState<string | null>(() => getLocalHistoryStore().lastSyncedAt)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const refresh = () => {
      const store = getLocalHistoryStore()
      setHistory(store.history)
      setPendingCount(getPendingCount())
      setSyncedAt(store.lastSyncedAt)
    }

    refresh()
    const unsubscribe = subscribeLocalHistoryUpdated(refresh)
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    let mounted = true

    async function loadCloudHistory() {
      if (!hasGistScope) {
        return
      }

      try {
        const response = await fetch('/api/user/history', {
          cache: 'no-store'
        })
        const payload = (await response.json().catch(() => null)) as
          | {
              cloudEnabled?: boolean
              history?: UserHistoryPayload
              syncedAt?: string | null
              error?: { message?: string }
            }
          | null

        if (!response.ok) {
          if (mounted) {
            setMessage(payload?.error?.message || '读取云端历史失败，已使用本地记录。')
          }
          return
        }

        if (!mounted) {
          return
        }

        setCloudEnabled(Boolean(payload?.cloudEnabled))
        if (payload?.history) {
          mergeCloudHistoryIntoLocal({
            cloudHistory: payload.history,
            syncedAt: payload.syncedAt || null
          })
        }
      } catch {
        if (mounted) {
          setMessage('读取云端历史失败，已使用本地记录。')
        }
      }
    }

    void loadCloudHistory()
    return () => {
      mounted = false
    }
  }, [hasGistScope])

  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('syncLocal') !== '1' || !hasGistScope) {
      return
    }

    void (async () => {
      setSyncing(true)
      const result = await syncLocalHistoryToCloud({
        force: true
      })
      setSyncing(false)
      if (result.synced) {
        setMessage('已完成本地历史上传并启用云同步。')
        url.searchParams.delete('syncLocal')
        const query = url.searchParams.toString()
        window.history.replaceState({}, '', query ? `${url.pathname}?${query}` : url.pathname)
      } else if (result.message) {
        setMessage(`云同步失败：${result.message}`)
      }
    })()
  }, [hasGistScope])

  const modeText = useMemo(() => {
    if (cloudEnabled && hasGistScope) {
      return '云同步已启用（私有 Gist）'
    }
    return '本地模式（未启用云同步）'
  }, [cloudEnabled, hasGistScope])

  async function handleSyncNow() {
    setSyncing(true)
    setMessage(null)
    const result = await syncLocalHistoryToCloud({
      force: true
    })
    setSyncing(false)

    if (result.synced) {
      setCloudEnabled(result.cloudEnabled)
      setSyncedAt(result.syncedAt)
      setMessage('同步成功。')
      return
    }

    setMessage(result.message || '同步失败，请稍后重试。')
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

      <section className='rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur'>
        <h2 className='font-title text-2xl text-[var(--color-ink)]'>同步状态</h2>
        <p className='mt-2 text-sm text-[var(--color-ink-soft)]'>
          {modeText}
          {syncedAt ? ` · 上次同步：${formatDateTime(syncedAt)}` : ''}
          {pendingCount > 0 ? ` · 待同步条目：${pendingCount}` : ''}
        </p>
        <div className='mt-3 flex flex-wrap gap-2'>
          {hasGistScope ? (
            <button
              type='button'
              onClick={handleSyncNow}
              disabled={syncing}
              className='rounded-xl bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-strong)] disabled:opacity-60'>
              {syncing ? '同步中...' : '立即同步'}
            </button>
          ) : (
            <button
              type='button'
              onClick={() => signIn('github', { callbackUrl: '/me?syncLocal=1' }, { scope: 'read:user user:email gist' })}
              className='rounded-xl bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-strong)]'>
              启用云同步
            </button>
          )}
        </div>
        {message ? <p className='mt-3 rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink-soft)]'>{message}</p> : null}
      </section>

      <section className='rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur'>
        <h2 className='font-title text-2xl text-[var(--color-ink)]'>最近阅读历史</h2>
        {history.read.length === 0 ? (
          <p className='mt-2 text-sm text-[var(--color-ink-soft)]'>暂无记录。</p>
        ) : (
          <ul className='mt-3 space-y-2'>
            {history.read.map(item => (
              <PostLinkItem key={`read:${item.locale}:${item.slug}`} item={item} kind='read' />
            ))}
          </ul>
        )}
      </section>

      <section className='rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur'>
        <h2 className='font-title text-2xl text-[var(--color-ink)]'>最近评论交互</h2>
        {history.comment.length === 0 ? (
          <p className='mt-2 text-sm text-[var(--color-ink-soft)]'>暂无记录。</p>
        ) : (
          <ul className='mt-3 space-y-2'>
            {history.comment.map(item => (
              <PostLinkItem key={`comment:${item.locale}:${item.slug}`} item={item} kind='comment' />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
