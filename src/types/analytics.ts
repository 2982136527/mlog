export type FooterStatsScope = 'blog' | 'site'

export type FooterStats = {
  visitors: number | null
  pageviews: number | null
  avgReadSeconds: number | null
  scope: FooterStatsScope
  startDate: string
  updatedAt: string
}

export type LiveCardErrorCode = 'NOT_HOT_DAILY_POST' | 'POST_NOT_FOUND' | 'REPO_NOT_FOUND_IN_POST' | 'GITHUB_UPSTREAM_FAILED'

export type LiveCardResponse = {
  enabled: true
  locale: 'zh' | 'en'
  slug: string
  repo: {
    fullName: string
    url: string
    language: string
    license: string | null
  }
  live: {
    stars: number
    forks: number
    openIssues: number
    pushedAt: string | null
    updatedAt: string | null
  }
  fetchedAt: string
  cacheTtlSeconds: number
}

export type LiveCardState =
  | {
      status: 'loading'
    }
  | {
      status: 'ready'
      data: LiveCardResponse
    }
  | {
      status: 'error'
      code: LiveCardErrorCode | 'UNKNOWN'
      message: string
    }
