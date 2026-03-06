import type { UserHistoryItem, UserHistoryPayload } from '@/types/user-history'

export const HISTORY_MAX_ITEMS = 200

type Bucket = 'read' | 'comment'

function toIsoNow(): string {
  return new Date().toISOString()
}

function normalizeItem(input: UserHistoryItem): UserHistoryItem | null {
  if (!input || (input.locale !== 'zh' && input.locale !== 'en')) {
    return null
  }

  const slug = (input.slug || '').trim()
  const title = (input.title || '').trim()
  if (!slug || !title) {
    return null
  }

  const firstParsed = Date.parse(input.firstAt)
  const lastParsed = Date.parse(input.lastAt)
  const firstAt = Number.isFinite(firstParsed) ? input.firstAt : toIsoNow()
  const lastAt = Number.isFinite(lastParsed) ? input.lastAt : firstAt
  const count = Number.isFinite(input.count) ? Math.max(1, Math.floor(input.count)) : 1

  return {
    locale: input.locale,
    slug,
    title,
    firstAt,
    lastAt,
    count
  }
}

function mergeItems(a: UserHistoryItem[], b: UserHistoryItem[]): UserHistoryItem[] {
  const map = new Map<string, UserHistoryItem>()

  for (const raw of [...a, ...b]) {
    const item = normalizeItem(raw)
    if (!item) {
      continue
    }
    const key = `${item.locale}:${item.slug}`
    const existing = map.get(key)
    if (!existing) {
      map.set(key, item)
      continue
    }
    const firstAt = Date.parse(existing.firstAt) <= Date.parse(item.firstAt) ? existing.firstAt : item.firstAt
    const lastAt = Date.parse(existing.lastAt) >= Date.parse(item.lastAt) ? existing.lastAt : item.lastAt
    map.set(key, {
      ...existing,
      title: item.title || existing.title,
      firstAt,
      lastAt,
      count: existing.count + item.count
    })
  }

  return Array.from(map.values())
    .sort((x, y) => Date.parse(y.lastAt) - Date.parse(x.lastAt))
    .slice(0, HISTORY_MAX_ITEMS)
}

export function emptyHistoryPayload(now = toIsoNow()): UserHistoryPayload {
  return {
    read: [],
    comment: [],
    updatedAt: now
  }
}

export function normalizeHistoryPayload(input: unknown): UserHistoryPayload {
  const now = toIsoNow()
  if (!input || typeof input !== 'object') {
    return emptyHistoryPayload(now)
  }

  const raw = input as {
    read?: UserHistoryItem[]
    comment?: UserHistoryItem[]
    updatedAt?: string
  }

  return {
    read: mergeItems(Array.isArray(raw.read) ? raw.read : [], []),
    comment: mergeItems(Array.isArray(raw.comment) ? raw.comment : [], []),
    updatedAt: Date.parse(raw.updatedAt || '') ? (raw.updatedAt as string) : now
  }
}

export function mergeHistoryPayload(a: UserHistoryPayload, b: UserHistoryPayload): UserHistoryPayload {
  return {
    read: mergeItems(a.read, b.read),
    comment: mergeItems(a.comment, b.comment),
    updatedAt: toIsoNow()
  }
}

export function recordHistoryItem(
  history: UserHistoryPayload,
  bucket: Bucket,
  input: {
    locale: 'zh' | 'en'
    slug: string
    title: string
  }
): UserHistoryPayload {
  const now = toIsoNow()
  const item: UserHistoryItem = {
    locale: input.locale,
    slug: input.slug.trim(),
    title: input.title.trim() || input.slug.trim(),
    firstAt: now,
    lastAt: now,
    count: 1
  }
  const updated = {
    ...history,
    [bucket]: mergeItems(history[bucket], [item]),
    updatedAt: now
  }
  return updated
}

export function countHistoryItems(history: UserHistoryPayload): number {
  return history.read.length + history.comment.length
}
