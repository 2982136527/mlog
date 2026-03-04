import type { AdminAiResult, PublishResult } from '@/types/admin'

export type GithubHotDailySource = 'github_trending_daily'

export type GithubHotDailyConfig = {
  enabled: boolean
  topicKeywords: string[]
  source: GithubHotDailySource
  timezone: 'Asia/Shanghai'
  scheduleLocalHour: 8
  updatedAt: string
  updatedBy: string
}

export type GithubHotRepoCandidate = {
  rank: number
  owner: string
  repo: string
  fullName: string
  url: string
  description: string
  language: string
  topics: string[]
  stars: number
  forks: number
  updatedAt: string
}

export type GithubHotRunStatus =
  | 'PUBLISHED'
  | 'SKIPPED_DISABLED'
  | 'SKIPPED_ALREADY_PUBLISHED_TODAY'
  | 'SKIPPED_NO_CANDIDATE'
  | 'SKIPPED_FETCH_FAILED'

export type GithubHotDailyRunResult = {
  status: GithubHotRunStatus
  dateStamp: string
  dateIso: string
  usedTopicFallback: boolean
  selectedRepo?: GithubHotRepoCandidate
  slug?: string
  reason?: string
  changedPaths?: string[]
  publish?: PublishResult
  ai?: AdminAiResult
}

export type GithubHotGeneratedPost = {
  title: string
  summary: string
  tags: string[]
  category: string
  markdown: string
}

