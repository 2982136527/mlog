export type ForumContentLocale = 'zh' | 'en'

export type ForumTranslationStatus = 'single' | 'bilingual'

export type ForumAuthor = {
  login: string
  avatarUrl: string
  url: string
}

export type ForumCategory = {
  id: string
  slug: string
  name: string
  description: string | null
  isAnswerable: boolean
}

export type ForumThreadSummary = {
  id: string
  number: number
  title: string
  bodyText: string
  url: string
  createdAt: string
  updatedAt: string
  author: ForumAuthor | null
  category: ForumCategory | null
  labels: string[]
  contentLocale: ForumContentLocale
  translationStatus: ForumTranslationStatus
  pairId: string | null
  counterpart: {
    number: number
    locale: ForumContentLocale
  } | null
  commentCount: number
  reactionCount: number
}

export type ForumReply = {
  id: string
  body: string
  createdAt: string
  updatedAt: string
  url: string
  author: ForumAuthor | null
}

export type ForumThreadDetail = {
  thread: ForumThreadSummary & {
    body: string
  }
  contentLocale: ForumContentLocale
  translationStatus: ForumTranslationStatus
  counterpart: {
    number: number
    locale: ForumContentLocale
  } | null
  replies: ForumReply[]
  pageInfo: {
    hasNextPage: boolean
    endCursor: string | null
  }
}

export type ForumMyReply = {
  id: string
  threadNumber: number
  threadTitle: string
  bodyText: string
  createdAt: string
  url: string
}

export type ForumScopeState = {
  hasDiscussionReadScope: boolean
  hasDiscussionWriteScope: boolean
}

export type ForumApiErrorCode =
  | 'FORUM_SCOPE_REQUIRED'
  | 'FORUM_UPSTREAM_FAILED'
  | 'FORUM_NOT_FOUND'
  | 'FORUM_INVALID_INPUT'
  | 'FORUM_REPO_NOT_CONFIGURED'
  | 'FORUM_TRANSLATION_FAILED'
  | 'FORUM_TRANSLATOR_KEY_REQUIRED'
  | 'FORUM_ENCRYPTION_MISCONFIGURED'

export type ForumTranslatorProfile = {
  hasGeminiKey: boolean
  model: string
  updatedAt: string | null
}
