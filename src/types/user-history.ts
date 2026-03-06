export type UserHistoryItem = {
  locale: 'zh' | 'en'
  slug: string
  title: string
  firstAt: string
  lastAt: string
  count: number
}

export type UserHistoryPayload = {
  read: UserHistoryItem[]
  comment: UserHistoryItem[]
  updatedAt: string
}

export type UserHistorySyncState = {
  cloudEnabled: boolean
  hasPendingLocal: boolean
  syncedAt: string | null
}
