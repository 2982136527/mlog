import 'server-only'
import { unstable_cache } from 'next/cache'
import type { FooterStats } from '@/types/analytics'

const DEFAULT_SITE_START_DATE = '2026-03-02'
const BLOG_PATH_RE = /^\/(zh|en)\/blog(?:\/|$)/

type UmamiStatsMetric = number | { value?: number | null } | null | undefined

type UmamiStatsResponse = {
  visitors?: UmamiStatsMetric
  pageviews?: UmamiStatsMetric
  visits?: UmamiStatsMetric
  totaltime?: UmamiStatsMetric
}

type UmamiExpandedMetricRow = {
  x?: string | null
  name?: string | null
  y?: number | null
  visitors?: number | null
  pageviews?: number | null
  visits?: number | null
  totaltime?: number | null
}

type UmamiExpandedMetricsResponse = UmamiExpandedMetricRow[] | { data?: UmamiExpandedMetricRow[] }

type UmamiContext = {
  apiBaseUrl: string
  websiteId: string
  token: string
  startDate: string
  startAt: number
  endAt: number
}

type StatsTotals = {
  visitors: number
  pageviews: number
  visits: number
  totaltime: number
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function toSafeNumber(value: unknown): number {
  return isFiniteNumber(value) ? value : 0
}

function readMetricValue(metric: UmamiStatsMetric): number {
  if (isFiniteNumber(metric)) {
    return metric
  }

  if (metric && typeof metric === 'object' && 'value' in metric) {
    return toSafeNumber(metric.value)
  }

  return 0
}

function formatSiteStartDate(raw: string | undefined): string {
  const value = (raw || '').trim()
  const isIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const timestamp = isIsoDate ? Date.parse(`${value}T00:00:00.000Z`) : Number.NaN

  if (isIsoDate && Number.isFinite(timestamp)) {
    return value
  }

  if (value) {
    console.warn(`[footer-stats] Invalid SITE_START_DATE "${value}", fallback to ${DEFAULT_SITE_START_DATE}`)
  }

  return DEFAULT_SITE_START_DATE
}

function normalizeApiBaseUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '')
  if (!trimmed) {
    return ''
  }

  if (trimmed.endsWith('/api') || trimmed.endsWith('/v1')) {
    return trimmed
  }

  return `${trimmed}/api`
}

function deriveUmamiApiBaseUrl(): string {
  const explicit = normalizeApiBaseUrl(process.env.UMAMI_API_BASE_URL || '')
  if (explicit) {
    return explicit
  }

  const scriptUrl = (process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL || '').trim()
  if (!scriptUrl) {
    return ''
  }

  try {
    return `${new URL(scriptUrl).origin}/api`
  } catch {
    console.warn(`[footer-stats] Invalid NEXT_PUBLIC_UMAMI_SCRIPT_URL "${scriptUrl}"`)
    return ''
  }
}

function resolveUmamiContext(): UmamiContext | null {
  const websiteId = (process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || '').trim()
  const token = (process.env.UMAMI_API_TOKEN || '').trim()
  const apiBaseUrl = deriveUmamiApiBaseUrl()
  const startDate = formatSiteStartDate(process.env.SITE_START_DATE)

  if (!websiteId || !token || !apiBaseUrl) {
    return null
  }

  const startAt = Date.parse(`${startDate}T00:00:00.000Z`)
  const endAt = Date.now()

  return {
    apiBaseUrl,
    websiteId,
    token,
    startDate,
    startAt,
    endAt
  }
}

function buildRequestUrl(context: UmamiContext, suffix: string, params: Record<string, string>): string {
  const url = new URL(`${context.apiBaseUrl}/websites/${encodeURIComponent(context.websiteId)}${suffix}`)
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value)
  })
  return url.toString()
}

async function fetchUmamiJson<T>(context: UmamiContext, suffix: string, params: Record<string, string>): Promise<T> {
  const url = buildRequestUrl(context, suffix, params)
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${context.token}`,
      'x-umami-api-key': context.token
    },
    next: { revalidate: 600 }
  })

  if (!response.ok) {
    const body = (await response.text()).slice(0, 240)
    throw new Error(`Umami API ${response.status} for ${suffix}: ${body}`)
  }

  return (await response.json()) as T
}

async function fetchSiteTotals(context: UmamiContext): Promise<StatsTotals> {
  const data = await fetchUmamiJson<UmamiStatsResponse>(context, '/stats', {
    startAt: String(context.startAt),
    endAt: String(context.endAt)
  })

  return {
    visitors: readMetricValue(data.visitors),
    pageviews: readMetricValue(data.pageviews),
    visits: readMetricValue(data.visits),
    totaltime: readMetricValue(data.totaltime)
  }
}

function extractExpandedRows(payload: UmamiExpandedMetricsResponse): UmamiExpandedMetricRow[] {
  if (Array.isArray(payload)) {
    return payload
  }

  if (payload && Array.isArray(payload.data)) {
    return payload.data
  }

  return []
}

async function fetchBlogTotalsFromPaths(context: UmamiContext): Promise<StatsTotals | null> {
  const payload = await fetchUmamiJson<UmamiExpandedMetricsResponse>(context, '/metrics/expanded', {
    type: 'path',
    startAt: String(context.startAt),
    endAt: String(context.endAt),
    limit: '5000'
  })

  const rows = extractExpandedRows(payload)
  const blogRows = rows.filter(row => {
    const path = (row.x || row.name || '').trim()
    return BLOG_PATH_RE.test(path)
  })

  if (blogRows.length === 0) {
    return null
  }

  const hasVisitorsField = blogRows.some(row => 'visitors' in row)
  const hasVisitsField = blogRows.some(row => 'visits' in row)
  const hasTotalTimeField = blogRows.some(row => 'totaltime' in row)
  if (!hasVisitorsField || !hasVisitsField || !hasTotalTimeField) {
    return null
  }

  return blogRows.reduce<StatsTotals>(
    (acc, row) => {
      acc.visitors += toSafeNumber(row.visitors)
      acc.pageviews += toSafeNumber(row.pageviews ?? row.y)
      acc.visits += toSafeNumber(row.visits)
      acc.totaltime += toSafeNumber(row.totaltime)
      return acc
    },
    { visitors: 0, pageviews: 0, visits: 0, totaltime: 0 }
  )
}

function toFooterStats(base: Pick<FooterStats, 'startDate'>, scope: FooterStats['scope'], totals: StatsTotals | null): FooterStats {
  const visitors = totals ? totals.visitors : null
  const pageviews = totals ? totals.pageviews : null
  const avgReadSeconds = totals && totals.visits > 0 ? totals.totaltime / totals.visits : null

  return {
    visitors,
    pageviews,
    avgReadSeconds,
    scope,
    startDate: base.startDate,
    updatedAt: new Date().toISOString()
  }
}

async function getFooterStatsUncached(): Promise<FooterStats> {
  const context = resolveUmamiContext()
  const startDate = formatSiteStartDate(process.env.SITE_START_DATE)

  if (!context) {
    return toFooterStats({ startDate }, 'blog', null)
  }

  try {
    const blogTotals = await fetchBlogTotalsFromPaths(context)
    if (blogTotals) {
      return toFooterStats({ startDate: context.startDate }, 'blog', blogTotals)
    }
  } catch (error) {
    console.warn('[footer-stats] Failed to build blog-only stats, fallback to site-wide stats', error)
  }

  try {
    const siteTotals = await fetchSiteTotals(context)
    return toFooterStats({ startDate: context.startDate }, 'site', siteTotals)
  } catch (error) {
    console.warn('[footer-stats] Failed to fetch site-wide stats', error)
    return toFooterStats({ startDate: context.startDate }, 'blog', null)
  }
}

const getCachedFooterStats = unstable_cache(getFooterStatsUncached, ['footer-stats'], {
  revalidate: 600
})

export async function getFooterStats(): Promise<FooterStats> {
  return getCachedFooterStats()
}
