export type FooterStatsScope = 'blog' | 'site'

export type FooterStats = {
  visitors: number | null
  pageviews: number | null
  avgReadSeconds: number | null
  scope: FooterStatsScope
  startDate: string
  updatedAt: string
}
