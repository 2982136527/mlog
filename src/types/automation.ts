import type { AdminAiResult, PublishResult } from '@/types/admin'

export type GithubHotDailySource = 'github_trending_daily'

export type InterestPreset = 'mixed' | 'ai_fun' | 'dev_tools' | 'creative_coding' | 'hardcore_engineering'

export type GithubHotDailyConfig = {
  enabled: boolean
  interestPreset: InterestPreset
  topicKeywords: string[]
  excludeKeywords: string[]
  minStars: number
  candidateWindow: number
  diversifyByLanguage: boolean
  source: GithubHotDailySource
  timezone: 'Asia/Shanghai'
  scheduleLocalHour: 8
  updatedAt: string
  updatedBy: 'admin' | 'system'
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

export type GithubHotCandidateScore = {
  fullName: string
  rank: number
  stars: number
  language: string
  matchedKeywords: string[]
  hitExcludeKeywords: string[]
  score: number
  reason: string[]
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
  selectedScore?: GithubHotCandidateScore
  selectedRepo?: GithubHotRepoCandidate
  slug?: string
  reason?: string
  changedPaths?: string[]
  publish?: PublishResult
  ai?: AdminAiResult
}

export type GithubHotCandidatesPreviewResult = {
  dateStamp: string
  dateIso: string
  usedTopicFallback: boolean
  keywords: string[]
  excludeKeywords: string[]
  candidates: Array<GithubHotRepoCandidate & { scoreInfo: GithubHotCandidateScore }>
}

export type GithubHotGeneratedPost = {
  title: string
  summary: string
  tags: string[]
  category: string
  markdown: string
}
