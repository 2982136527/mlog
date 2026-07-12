'use client'

import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { useEffect, useMemo, useState } from 'react'
import type { Locale } from '@/i18n/config'
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
  locale: Locale
}

function formatDateTime(value: string, locale: Locale): string {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) {
    return value
  }
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp))
}

function PostLinkItem({
  item,
  kind,
  locale
}: {
  item: UserHistoryItem
  kind: 'read' | 'comment'
  locale: Locale
}) {
  const href = `/${item.locale}/blog/${item.slug}`
  const countLabel = kind === 'read' ? (locale === 'zh' ? '浏览次数' : 'Views') : locale === 'zh' ? '交互次数' : 'Interactions'
  const latestLabel = kind === 'read' ? (locale === 'zh' ? '最近浏览' : 'Last Read') : locale === 'zh' ? '最近交互' : 'Last Interaction'

  return (
    <li className='rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-3 text-sm'>
      <Link href={href} className='font-medium text-[var(--color-ink)] transition hover:text-[var(--color-brand)]'>
        {item.title}
      </Link>
      <p className='mt-1 text-xs text-[var(--color-ink-soft)]'>
        {item.locale.toUpperCase()} · {item.slug}
      </p>
      <p className='mt-1 text-xs text-[var(--color-ink-soft)]'>
        {countLabel}: {item.count} · {latestLabel}: {formatDateTime(item.lastAt, locale)}
      </p>
    </li>
  )
}

export function MeDashboard({ login, hasGistScope, locale }: MeDashboardProps) {
  const copy =
    locale === 'zh'
      ? {
          pageTitle: '我的',
          currentUser: '当前用户',
          back: '返回前台',
          signOut: '退出登录',
          syncTitle: '同步状态',
          syncModeCloud: '云同步已启用（私有 Gist）',
          syncModeLocal: '本地模式（未启用云同步）',
          syncLast: '上次同步',
          syncPending: '待同步条目',
          syncButton: '立即同步',
          syncing: '同步中...',
          enableCloud: '启用云同步',
          syncUploaded: '已完成本地历史上传并启用云同步。',
          syncSuccess: '同步成功。',
          syncFail: '同步失败，请稍后重试。',
          cloudLoadFail: '读取云端历史失败，已使用本地记录。',
          cloudFailPrefix: '云同步失败',
          readTitle: '最近阅读历史',
          commentTitle: '最近评论交互',
          empty: '暂无记录。',
          apiKeyTitle: 'API 密钥',
          apiKeyDescription: '用于 AI Agent 自动发布文章的 API 密钥。可在各 AI 客户端中配置为工具调用。',
          apiKeyNameLabel: '密钥名称',
          apiKeyGenerateButton: '生成新密钥',
          apiKeyGenerating: '生成中...',
          apiKeyRevokeButton: '撤销',
          apiKeyRevokeConfirm: '确定要撤销此密钥吗？撤销后无法恢复。',
          apiKeyNewKeyHint: '请立即复制此密钥，关闭后将无法再次查看。',
          apiKeyCopyButton: '复制',
          apiKeyCopiedText: '已复制',
          apiKeyLastUsed: '上次使用',
          apiKeyNeverUsed: '从未使用',
          apiKeyEmpty: '暂无 API 密钥。',
          apiKeyErrorPrefix: '操作失败',
          apiKeyCreated: '创建于',
          apiKeyCancel: '取消'
        }
      : {
          pageTitle: 'My',
          currentUser: 'Current User',
          back: 'Back to Site',
          signOut: 'Sign Out',
          syncTitle: 'Sync Status',
          syncModeCloud: 'Cloud sync enabled (private Gist)',
          syncModeLocal: 'Local mode (cloud sync not enabled)',
          syncLast: 'Last synced',
          syncPending: 'Pending items',
          syncButton: 'Sync Now',
          syncing: 'Syncing...',
          enableCloud: 'Enable Cloud Sync',
          syncUploaded: 'Local history uploaded. Cloud sync is now enabled.',
          syncSuccess: 'Sync succeeded.',
          syncFail: 'Sync failed. Please try again later.',
          cloudLoadFail: 'Failed to load cloud history. Showing local data.',
          cloudFailPrefix: 'Cloud sync failed',
          readTitle: 'Recent Reading History',
          commentTitle: 'Recent Comment Interactions',
          empty: 'No records yet.',
          apiKeyTitle: 'API Keys',
          apiKeyDescription: 'API keys for AI agents to auto-publish blog posts.',
          apiKeyNameLabel: 'Key Name',
          apiKeyGenerateButton: 'Generate New Key',
          apiKeyGenerating: 'Generating...',
          apiKeyRevokeButton: 'Revoke',
          apiKeyRevokeConfirm: 'Are you sure you want to revoke this key? This action cannot be undone.',
          apiKeyNewKeyHint: 'Copy this key now. You will not be able to see it again after closing.',
          apiKeyCopyButton: 'Copy',
          apiKeyCopiedText: 'Copied',
          apiKeyLastUsed: 'Last Used',
          apiKeyNeverUsed: 'Never Used',
          apiKeyEmpty: 'No API keys yet.',
          apiKeyErrorPrefix: 'Operation failed',
          apiKeyCreated: 'Created',
          apiKeyCancel: 'Cancel'
        }
  const [history, setHistory] = useState<UserHistoryPayload>(() => getLocalHistoryStore().history)
  const [pendingCount, setPendingCount] = useState<number>(() => getPendingCount())
  const [syncing, setSyncing] = useState(false)
  const [cloudEnabled, setCloudEnabled] = useState(hasGistScope)
  const [syncedAt, setSyncedAt] = useState<string | null>(() => getLocalHistoryStore().lastSyncedAt)
  const [message, setMessage] = useState<string | null>(null)

  type ApiKey = {
    id: string
    key_prefix: string
    name: string
    created_at: string
    last_used_at: string | null
    is_active: boolean
  }

  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [newKeyPlainText, setNewKeyPlainText] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [keyName, setKeyName] = useState('')
  const [showKeyForm, setShowKeyForm] = useState(false)
  const [keyError, setKeyError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let mounted = true
    fetch('/api/user/api-keys')
      .then(r => r.json())
      .then(data => {
        if (mounted && data.keys) setApiKeys(data.keys)
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  async function handleGenerate() {
    if (!keyName.trim()) return
    setGenerating(true)
    setKeyError(null)
    try {
      const res = await fetch('/api/user/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: keyName.trim() })
      })
      const data = await res.json()
      if (!res.ok) {
        setKeyError(data?.error?.message || copy.apiKeyErrorPrefix)
        return
      }
      setNewKeyPlainText(data.plainTextKey)
      setShowKeyForm(false)
      setKeyName('')
      const listRes = await fetch('/api/user/api-keys')
      const listData = await listRes.json()
      if (listData.keys) setApiKeys(listData.keys)
    } catch {
      setKeyError(copy.apiKeyErrorPrefix)
    } finally {
      setGenerating(false)
    }
  }

  async function handleRevoke(id: string) {
    if (!window.confirm(copy.apiKeyRevokeConfirm)) return
    try {
      const res = await fetch(`/api/user/api-keys?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setKeyError(data?.error?.message || copy.apiKeyErrorPrefix)
        return
      }
      setApiKeys(prev => prev.filter(k => k.id !== id))
    } catch {
      setKeyError(copy.apiKeyErrorPrefix)
    }
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    }).catch(() => {})
  }

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
            setMessage(payload?.error?.message || copy.cloudLoadFail)
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
          setMessage(copy.cloudLoadFail)
        }
      }
    }

    void loadCloudHistory()
    return () => {
      mounted = false
    }
  }, [hasGistScope, copy.cloudLoadFail])

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
        setMessage(copy.syncUploaded)
        url.searchParams.delete('syncLocal')
        const query = url.searchParams.toString()
        window.history.replaceState({}, '', query ? `${url.pathname}?${query}` : url.pathname)
      } else if (result.message) {
        setMessage(`${copy.cloudFailPrefix}: ${result.message}`)
      }
    })()
  }, [hasGistScope, copy.cloudFailPrefix, copy.syncUploaded])

  const modeText = useMemo(() => {
    if (cloudEnabled && hasGistScope) {
      return copy.syncModeCloud
    }
    return copy.syncModeLocal
  }, [cloudEnabled, copy.syncModeCloud, copy.syncModeLocal, hasGistScope])

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
      setMessage(copy.syncSuccess)
      return
    }

    setMessage(result.message || copy.syncFail)
  }

  return (
    <div className='mx-auto max-w-6xl space-y-5 px-5 pt-8 pb-10 sm:px-8'>
      <header className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='font-title text-4xl text-[var(--color-ink)]'>{copy.pageTitle}</h1>
          <p className='text-sm text-[var(--color-ink-soft)]'>
            {copy.currentUser}: @{login}
          </p>
        </div>
        <div className='flex flex-wrap gap-2 text-sm'>
          <Link
            href={`/${locale}`}
            className='rounded-xl border border-[var(--color-border-strong)] bg-white px-4 py-2 text-[var(--color-ink-soft)] transition hover:text-[var(--color-ink)]'>
            {copy.back}
          </Link>
          <Link
            href={`/api/auth/signout?callbackUrl=%2F${locale}`}
            className='rounded-xl border border-[var(--color-border-strong)] bg-white px-4 py-2 text-[var(--color-ink-soft)] transition hover:text-[var(--color-ink)]'>
            {copy.signOut}
          </Link>
        </div>
      </header>

      <section className='rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur'>
        <h2 className='font-title text-2xl text-[var(--color-ink)]'>{copy.syncTitle}</h2>
        <p className='mt-2 text-sm text-[var(--color-ink-soft)]'>
          {modeText}
          {syncedAt ? ` · ${copy.syncLast}: ${formatDateTime(syncedAt, locale)}` : ''}
          {pendingCount > 0 ? ` · ${copy.syncPending}: ${pendingCount}` : ''}
        </p>
        <div className='mt-3 flex flex-wrap gap-2'>
          {hasGistScope ? (
            <button
              type='button'
              onClick={handleSyncNow}
              disabled={syncing}
              className='rounded-xl bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-strong)] disabled:opacity-60'>
              {syncing ? copy.syncing : copy.syncButton}
            </button>
          ) : (
            <button
              type='button'
              onClick={() =>
                signIn(
                  'github',
                  { callbackUrl: `/me?locale=${locale}&syncLocal=1` },
                  { scope: 'read:user user:email gist' }
                )
              }
              className='rounded-xl bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-strong)]'>
              {copy.enableCloud}
            </button>
          )}
        </div>
        {message ? <p className='mt-3 rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink-soft)]'>{message}</p> : null}
      </section>

      <section className='rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur'>
        <h2 className='font-title text-2xl text-[var(--color-ink)]'>{copy.apiKeyTitle}</h2>
        <p className='mt-2 text-sm text-[var(--color-ink-soft)]'>{copy.apiKeyDescription}</p>

        {newKeyPlainText ? (
          <div className='mt-3 rounded-xl border-2 border-yellow-400 bg-yellow-50 px-4 py-3'>
            <p className='text-sm font-medium text-yellow-800'>{copy.apiKeyNewKeyHint}</p>
            <div className='mt-2 flex items-center gap-2'>
              <code className='flex-1 break-all rounded-lg bg-white px-3 py-2 text-sm font-mono text-[var(--color-ink)]'>{newKeyPlainText}</code>
              <button
                type='button'
                onClick={() => handleCopy(newKeyPlainText)}
                className='shrink-0 rounded-lg bg-[var(--color-brand)] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-strong)]'>
                {copied ? copy.apiKeyCopiedText : copy.apiKeyCopyButton}
              </button>
              <button
                type='button'
                onClick={() => setNewKeyPlainText(null)}
                className='shrink-0 rounded-lg bg-[var(--color-border-strong)] px-2 py-2 text-sm text-[var(--color-ink-soft)] transition hover:text-[var(--color-ink)]'>
                ✕
              </button>
            </div>
          </div>
        ) : null}

        <div className='mt-3 flex flex-wrap gap-2'>
          {!showKeyForm ? (
            <button
              type='button'
              onClick={() => setShowKeyForm(true)}
              className='rounded-xl bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-strong)]'>
              {copy.apiKeyGenerateButton}
            </button>
          ) : (
            <div className='flex w-full flex-wrap items-center gap-2'>
              <input
                value={keyName}
                onChange={e => setKeyName(e.target.value)}
                placeholder={copy.apiKeyNameLabel}
                className='flex-1 rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-brand)]'
                onKeyDown={e => { if (e.key === 'Enter') handleGenerate() }}
              />
              <button
                type='button'
                onClick={handleGenerate}
                disabled={generating || !keyName.trim()}
                className='rounded-xl bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-strong)] disabled:opacity-60'>
                {generating ? copy.apiKeyGenerating : copy.apiKeyGenerateButton}
              </button>
              <button
                type='button'
                onClick={() => { setShowKeyForm(false); setKeyName('') }}
                className='rounded-xl border border-[var(--color-border-strong)] bg-white px-4 py-2 text-sm text-[var(--color-ink-soft)] transition hover:text-[var(--color-ink)]'>
                {copy.apiKeyCancel}
              </button>
            </div>
          )}
        </div>

        {keyError ? (
          <p className='mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600'>{keyError}</p>
        ) : null}

        {apiKeys.length === 0 && !newKeyPlainText ? (
          <p className='mt-3 text-sm text-[var(--color-ink-soft)]'>{copy.apiKeyEmpty}</p>
        ) : (
          <ul className='mt-3 space-y-2'>
            {apiKeys.filter(k => k.is_active).map(key => (
              <li key={key.id} className='rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-3 text-sm'>
                <div className='flex items-center justify-between gap-3'>
                  <div className='min-w-0 flex-1'>
                    <p className='font-medium text-[var(--color-ink)]'>{key.name}</p>
                    <p className='mt-0.5 text-xs text-[var(--color-ink-soft)]'>
                      <code className='font-mono'>{'mlog_'}{key.key_prefix}...</code>
                      {' · '}{copy.apiKeyCreated}: {formatDateTime(key.created_at, locale)}
                      {key.last_used_at
                        ? ` · ${copy.apiKeyLastUsed}: ${formatDateTime(key.last_used_at, locale)}`
                        : ` · ${copy.apiKeyNeverUsed}`
                      }
                    </p>
                  </div>
                  <button
                    type='button'
                    onClick={() => handleRevoke(key.id)}
                    className='shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 transition hover:bg-red-50'>
                    {copy.apiKeyRevokeButton}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className='rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur'>
        <h2 className='font-title text-2xl text-[var(--color-ink)]'>{copy.readTitle}</h2>
        {history.read.length === 0 ? (
          <p className='mt-2 text-sm text-[var(--color-ink-soft)]'>{copy.empty}</p>
        ) : (
          <ul className='mt-3 space-y-2'>
            {history.read.map(item => (
              <PostLinkItem key={`read:${item.locale}:${item.slug}`} item={item} kind='read' locale={locale} />
            ))}
          </ul>
        )}
      </section>

      <section className='rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur'>
        <h2 className='font-title text-2xl text-[var(--color-ink)]'>{copy.commentTitle}</h2>
        {history.comment.length === 0 ? (
          <p className='mt-2 text-sm text-[var(--color-ink-soft)]'>{copy.empty}</p>
        ) : (
          <ul className='mt-3 space-y-2'>
            {history.comment.map(item => (
              <PostLinkItem key={`comment:${item.locale}:${item.slug}`} item={item} kind='comment' locale={locale} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
