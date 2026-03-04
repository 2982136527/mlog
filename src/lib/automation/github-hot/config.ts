import { z } from 'zod'
import type { GithubHotDailyConfig } from '@/types/automation'

export const GITHUB_HOT_DAILY_CONFIG_PATH = 'content/system/automation/github-hot-daily.json'
export const SHANGHAI_TIMEZONE = 'Asia/Shanghai'
export const DAILY_SCHEDULE_HOUR = 8 as const

const githubHotDailyConfigSchema = z.object({
  enabled: z.boolean(),
  topicKeywords: z.array(z.string()),
  source: z.literal('github_trending_daily'),
  timezone: z.literal('Asia/Shanghai'),
  scheduleLocalHour: z.literal(8),
  updatedAt: z.string().trim().min(1),
  updatedBy: z.string().trim().min(1)
})

const githubHotDailyConfigUpdateSchema = z.object({
  enabled: z.boolean(),
  topicKeywords: z.array(z.string()).optional()
})

function normalizeKeywords(topicKeywords: string[]): string[] {
  return Array.from(
    new Set(
      topicKeywords
        .map(keyword => keyword.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 20)
    )
  )
}

export function buildDefaultGithubHotDailyConfig(actor = 'system'): GithubHotDailyConfig {
  return {
    enabled: false,
    topicKeywords: [],
    source: 'github_trending_daily',
    timezone: SHANGHAI_TIMEZONE,
    scheduleLocalHour: DAILY_SCHEDULE_HOUR,
    updatedAt: new Date().toISOString(),
    updatedBy: actor
  }
}

export function parseGithubHotDailyConfig(raw: unknown): GithubHotDailyConfig {
  const parsed = githubHotDailyConfigSchema.parse(raw)
  return {
    ...parsed,
    topicKeywords: normalizeKeywords(parsed.topicKeywords)
  }
}

export function parseGithubHotDailyConfigUpdate(raw: unknown): Pick<GithubHotDailyConfig, 'enabled' | 'topicKeywords'> {
  const parsed = githubHotDailyConfigUpdateSchema.parse(raw)
  return {
    enabled: parsed.enabled,
    topicKeywords: normalizeKeywords(parsed.topicKeywords || [])
  }
}

export function serializeGithubHotDailyConfig(config: GithubHotDailyConfig): string {
  const normalized: GithubHotDailyConfig = {
    enabled: Boolean(config.enabled),
    topicKeywords: normalizeKeywords(config.topicKeywords),
    source: 'github_trending_daily',
    timezone: SHANGHAI_TIMEZONE,
    scheduleLocalHour: DAILY_SCHEDULE_HOUR,
    updatedAt: config.updatedAt,
    updatedBy: config.updatedBy
  }

  return `${JSON.stringify(normalized, null, 2)}\n`
}

