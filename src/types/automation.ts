import type { AdminAiResult, PublishResult } from '@/types/admin'

export type GithubHotDailySource = 'github_trending_daily'
export type AutomationTriggerSource = 'cron_main' | 'cron_backfill' | 'admin_manual'
export type AutomationHealthState = 'ok' | 'pending' | 'missed' | 'disabled'

export type AutomationHealth = {
  dateStamp: string
  state: AutomationHealthState
  expectedRunAtLocal: string
  backfillAtLocal: string
  hasPublishedToday: boolean
}

export type InterestPreset =
  | 'mixed'
  | 'ai_fun'
  | 'dev_tools'
  | 'creative_coding'
  | 'hardcore_engineering'
  | 'security'
  | 'data_ai'
  | 'mobile_dev'
  | 'game_dev'
  | 'design_ux'
  | 'hardware_iot'
  | 'browser_extension'
  | 'productivity'

export type CandidateSelectionMode = 'scored_keyword' | 'theme_random_seeded'

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

export type GithubRepoEvidence = {
  fullName: string
  url: string
  description: string
  language: string
  stars: number
  forks: number
  openIssues: number
  license: string | null
  createdAt: string | null
  pushedAt: string | null
  defaultBranch: string | null
  latestReleaseTag: string | null
  latestReleaseAt: string | null
  readmeHighlights: string[]
  sourceUrls: string[]
  fetchedAt: string
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
  | 'SKIPPED_ALREADY_HEALTHY'
  | 'SKIPPED_NO_CANDIDATE'
  | 'SKIPPED_FETCH_FAILED'

export type GithubHotDailyRunResult = {
  status: GithubHotRunStatus
  dateStamp: string
  dateIso: string
  triggerSource: AutomationTriggerSource
  bypassedDailyLimit?: boolean
  usedTopicFallback: boolean
  selectionMode: CandidateSelectionMode
  presetKeywords: string[]
  overlayKeywords: string[]
  effectiveKeywords: string[]
  randomSeedDate: string | null
  selectedScore?: GithubHotCandidateScore
  selectedRepo?: GithubHotRepoCandidate
  slug?: string
  reason?: string
  changedPaths?: string[]
  publish?: PublishResult
  ai?: AdminAiResult
  fixedTags?: string[]
  quality?: {
    passed: boolean
    retryCount: number
    failedChecks: string[]
  }
  evidence?: {
    sourceCount: number
    readmeHighlightsCount: number
  }
}

export type GithubHotDailyLastRunState = {
  requestId: string
  actor: string
  runAt: string
  result: GithubHotDailyRunResult
}

export type GithubHotCandidatesPreviewResult = {
  dateStamp: string
  dateIso: string
  usedTopicFallback: boolean
  selectionMode: CandidateSelectionMode
  presetKeywords: string[]
  overlayKeywords: string[]
  effectiveKeywords: string[]
  randomSeedDate: string | null
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

export type AiPaperDailySource = 'arxiv_pwc'

export type AiPaperDailyConfig = {
  enabled: boolean
  source: AiPaperDailySource
  timezone: 'Asia/Shanghai'
  scheduleLocalTime: '12:30'
  arxivCategories: string[]
  maxCandidates: number
  minSignalsScore: number
  includeCodeFirst: boolean
  updatedAt: string
  updatedBy: 'admin' | 'system'
}

export type AiPaperCandidate = {
  rank: number
  arxivId: string
  title: string
  summary: string
  authors: string[]
  categories: string[]
  publishedAt: string
  updatedAt: string
  paperUrl: string
  pwcUrl: string | null
  codeUrl: string | null
  hasCode: boolean
  signalsScore: number
}

export type AiPaperEvidence = {
  arxivId: string
  title: string
  summary: string
  authors: string[]
  categories: string[]
  publishedAt: string
  updatedAt: string
  paperUrl: string
  pwcUrl: string | null
  codeUrl: string | null
  hasCode: boolean
  signalsScore: number
  sourceUrls: string[]
  fetchedAt: string
}

export type AiPaperRunStatus =
  | 'PUBLISHED'
  | 'SKIPPED_DISABLED'
  | 'SKIPPED_ALREADY_PUBLISHED_TODAY'
  | 'SKIPPED_ALREADY_HEALTHY'
  | 'SKIPPED_NO_CANDIDATE'
  | 'SKIPPED_FETCH_FAILED'
  | 'SKIPPED_QUALITY_FAILED'

export type AiPaperDailyRunResult = {
  status: AiPaperRunStatus
  dateStamp: string
  dateIso: string
  triggerSource: AutomationTriggerSource
  slug?: string
  selectedPaper?: {
    arxivId: string
    title: string
    paperUrl: string
    pwcUrl?: string
  }
  reason?: string
  changedPaths?: string[]
  publish?: PublishResult
  ai?: AdminAiResult
  fixedTags?: string[]
  quality?: {
    passed: boolean
    retryCount: number
    failedChecks: string[]
  }
  evidence?: {
    sourceCount: number
  }
}

export type AiPaperDailyLastRunState = {
  requestId: string
  actor: string
  runAt: string
  result: AiPaperDailyRunResult
}

export type AiPaperGeneratedPost = {
  title: string
  summary: string
  tags: string[]
  category: string
  markdown: string
}
