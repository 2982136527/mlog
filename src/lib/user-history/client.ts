'use client'

import {
  countHistoryItems,
  emptyHistoryPayload,
  mergeHistoryPayload,
  normalizeHistoryPayload,
  recordHistoryItem
} from '@/lib/user-history/shared'
import type { UserHistoryPayload, UserHistorySyncState } from '@/types/user-history'

type HistoryBucket = 'read' | 'comment'

type LocalHistoryStore = {
  history: UserHistoryPayload
  pending: boolean
  lastSyncedAt: string | null
}

type AuthStatus = {
  loggedIn: boolean
  hasGistScope: boolean
}

type SyncResponse = {
  cloudEnabled: boolean
  synced: boolean
  uploadedCount: number
  syncedAt: string | null
  history?: UserHistoryPayload | null
  message?: string
}

const STORAGE_KEY = 'mlog_user_history_v1'
const HISTORY_EVENT = 'mlog:user-history-updated'
const SYNC_THROTTLE_MS = 10_000

let syncTimer: ReturnType<typeof setTimeout> | null = null
let authCache: { at: number; value: AuthStatus } | null = null
let unloadBound = false

function getDefaultStore(): LocalHistoryStore {
  return {
    history: emptyHistoryPayload(),
    pending: false,
    lastSyncedAt: null
  }
}

function readStore(): LocalHistoryStore {
  if (typeof window === 'undefined') {
    return getDefaultStore()
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return getDefaultStore()
  }

  try {
    const parsed = JSON.parse(raw) as {
      history?: unknown
      pending?: boolean
      lastSyncedAt?: string | null
    }
    return {
      history: normalizeHistoryPayload(parsed.history),
      pending: Boolean(parsed.pending),
      lastSyncedAt: typeof parsed.lastSyncedAt === 'string' ? parsed.lastSyncedAt : null
    }
  } catch {
    return getDefaultStore()
  }
}

function emitHistoryUpdated(): void {
  if (typeof window === 'undefined') {
    return
  }
  window.dispatchEvent(new CustomEvent(HISTORY_EVENT))
}

function writeStore(store: LocalHistoryStore): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  emitHistoryUpdated()
}

function bindUnloadFlush(): void {
  if (typeof window === 'undefined' || unloadBound) {
    return
  }

  unloadBound = true
  const flushOnUnload = () => {
    const store = readStore()
    if (!store.pending) {
      return
    }
    const payload = JSON.stringify({
      history: store.history
    })
    try {
      const blob = new Blob([payload], {
        type: 'application/json'
      })
      navigator.sendBeacon('/api/user/history/sync', blob)
    } catch {
      // no-op
    }
  }

  window.addEventListener('pagehide', flushOnUnload)
  window.addEventListener('beforeunload', flushOnUnload)
}

async function getAuthStatus(force = false): Promise<AuthStatus> {
  const now = Date.now()
  if (!force && authCache && now - authCache.at < 60_000) {
    return authCache.value
  }

  try {
    const response = await fetch('/api/auth/session', {
      cache: 'no-store'
    })
    if (!response.ok) {
      const value = {
        loggedIn: false,
        hasGistScope: false
      }
      authCache = { at: now, value }
      return value
    }

    const session = (await response.json()) as {
      user?: {
        login?: string
        hasGistScope?: boolean
      }
    }
    const value = {
      loggedIn: Boolean(session?.user?.login),
      hasGistScope: Boolean(session?.user?.hasGistScope)
    }
    authCache = { at: now, value }
    return value
  } catch {
    const value = {
      loggedIn: false,
      hasGistScope: false
    }
    authCache = { at: now, value }
    return value
  }
}

export function getLocalHistoryStore(): LocalHistoryStore {
  return readStore()
}

export function getLocalHistoryState(): UserHistorySyncState {
  const store = readStore()
  return {
    cloudEnabled: false,
    hasPendingLocal: store.pending,
    syncedAt: store.lastSyncedAt
  }
}

export function subscribeLocalHistoryUpdated(listener: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }
  const wrapped = () => listener()
  window.addEventListener(HISTORY_EVENT, wrapped)
  return () => window.removeEventListener(HISTORY_EVENT, wrapped)
}

export function recordLocalHistoryEvent(input: {
  type: HistoryBucket
  locale: 'zh' | 'en'
  slug: string
  title: string
}): void {
  bindUnloadFlush()

  const current = readStore()
  const nextHistory = recordHistoryItem(current.history, input.type, {
    locale: input.locale,
    slug: input.slug,
    title: input.title
  })

  writeStore({
    history: nextHistory,
    pending: true,
    lastSyncedAt: current.lastSyncedAt
  })

  scheduleHistorySync()
}

export function mergeCloudHistoryIntoLocal(input: {
  cloudHistory: UserHistoryPayload
  markSynced?: boolean
  syncedAt?: string | null
}): void {
  const current = readStore()
  const merged = mergeHistoryPayload(current.history, normalizeHistoryPayload(input.cloudHistory))
  writeStore({
    history: merged,
    pending: input.markSynced ? false : current.pending,
    lastSyncedAt: input.syncedAt || current.lastSyncedAt
  })
}

export function scheduleHistorySync(): void {
  if (syncTimer) {
    return
  }

  syncTimer = setTimeout(() => {
    syncTimer = null
    void syncLocalHistoryToCloud()
  }, SYNC_THROTTLE_MS)
}

export async function syncLocalHistoryToCloud(options?: {
  force?: boolean
}): Promise<SyncResponse> {
  const force = Boolean(options?.force)
  const current = readStore()
  const auth = await getAuthStatus(force)

  if (!auth.loggedIn) {
    return {
      cloudEnabled: false,
      synced: false,
      uploadedCount: 0,
      syncedAt: current.lastSyncedAt
    }
  }

  if (!auth.hasGistScope) {
    return {
      cloudEnabled: false,
      synced: false,
      uploadedCount: 0,
      syncedAt: current.lastSyncedAt
    }
  }

  if (!force && !current.pending) {
    return {
      cloudEnabled: true,
      synced: true,
      uploadedCount: 0,
      syncedAt: current.lastSyncedAt,
      history: current.history
    }
  }

  try {
    const response = await fetch('/api/user/history/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        history: current.history
      }),
      keepalive: true
    })
    const payload = (await response.json().catch(() => null)) as
      | {
          cloudEnabled?: boolean
          synced?: boolean
          uploadedCount?: number
          syncedAt?: string | null
          history?: UserHistoryPayload
          error?: { message?: string }
        }
      | null

    if (!response.ok) {
      return {
        cloudEnabled: false,
        synced: false,
        uploadedCount: 0,
        syncedAt: current.lastSyncedAt,
        message: payload?.error?.message || 'sync failed'
      }
    }

    const nextHistory = payload?.history ? normalizeHistoryPayload(payload.history) : current.history
    const syncedAt = typeof payload?.syncedAt === 'string' ? payload.syncedAt : new Date().toISOString()
    writeStore({
      history: nextHistory,
      pending: false,
      lastSyncedAt: syncedAt
    })

    return {
      cloudEnabled: Boolean(payload?.cloudEnabled),
      synced: Boolean(payload?.synced),
      uploadedCount: Number.isFinite(payload?.uploadedCount) ? Number(payload?.uploadedCount) : 0,
      syncedAt,
      history: nextHistory
    }
  } catch {
    return {
      cloudEnabled: true,
      synced: false,
      uploadedCount: 0,
      syncedAt: current.lastSyncedAt,
      message: 'sync failed'
    }
  }
}

export function getPendingCount(): number {
  const store = readStore()
  if (!store.pending) {
    return 0
  }
  return countHistoryItems(store.history)
}
