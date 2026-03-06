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
