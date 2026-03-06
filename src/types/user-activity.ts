export type UserReadHistoryItem = {
  locale: 'zh' | 'en'
  slug: string
  title: string
  firstViewedAt: string
  lastViewedAt: string
  viewCount: number
}

export type UserCommentActivityItem = {
  locale: 'zh' | 'en'
  slug: string
  title: string
  firstInteractedAt: string
  lastInteractedAt: string
  interactionCount: number
}
