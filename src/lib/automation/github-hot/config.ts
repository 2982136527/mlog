import { z } from 'zod'
import type { GithubHotDailyConfig, InterestPreset } from '@/types/automation'

export const GITHUB_HOT_DAILY_CONFIG_PATH = 'content/system/automation/github-hot-daily.json'
export const SHANGHAI_TIMEZONE = 'Asia/Shanghai'
export const DAILY_SCHEDULE_HOUR = 8 as const
export const BACKFILL_SCHEDULE_HOUR = 10 as const
export const GITHUB_HOT_DAILY_SLUG_PREFIX = 'gh-hot-' as const
export const DEFAULT_CANDIDATE_WINDOW = 30
export const DEFAULT_MIN_STARS = 500

export const INTEREST_PRESET_KEYWORDS: Record<InterestPreset, string[]> = {
  mixed: ['ai', 'agent', 'llm', 'demo', 'toy', 'creative-coding', 'webgl', 'cli', 'automation', 'open-source'],
  ai_fun: ['ai', 'agent', 'llm', 'multimodal', 'rag', 'workflow', 'copilot'],
  dev_tools: ['cli', 'sdk', 'devtool', 'terminal', 'productivity', 'testing'],
  creative_coding: ['webgl', '3d', 'animation', 'design', 'video', 'image', 'shader'],
  hardcore_engineering: ['database', 'compiler', 'rust', 'kernel', 'infra', 'distributed'],
  security: ['security', 'pentest', 'vulnerability', 'cve', 'auth', 'reverse', 'forensics', 'sandbox'],
  data_ai: ['data', 'dataset', 'etl', 'analytics', 'mlops', 'pipeline', 'vector', 'dbt'],
  mobile_dev: ['ios', 'android', 'flutter', 'react-native', 'swift', 'kotlin', 'mobile', 'xcode'],
  game_dev: ['game', 'gamedev', 'unity', 'unreal', 'godot', 'graphics', 'shader', 'physics'],
  design_ux: ['design', 'design-system', 'figma', 'ux', 'ui', 'typography', 'animation', 'a11y'],
  hardware_iot: ['iot', 'embedded', 'firmware', 'esp32', 'arduino', 'robotics', 'sensor', 'edge'],
  browser_extension: ['extension', 'webextension', 'chrome-extension', 'firefox', 'userscript', 'browser'],
  productivity: ['productivity', 'workflow', 'task', 'note', 'automation', 'template', 'cli', 'tool']
}

const githubHotDailyConfigSchema = z.object({
  enabled: z.boolean(),
  interestPreset: z.enum([
    'mixed',
    'ai_fun',
    'dev_tools',
    'creative_coding',
    'hardcore_engineering',
    'security',
    'data_ai',
    'mobile_dev',
    'game_dev',
    'design_ux',
    'hardware_iot',
    'browser_extension',
    'productivity'
  ]),
  topicKeywords: z.array(z.string()),
  excludeKeywords: z.array(z.string()),
  minStars: z.number().int().min(0).max(10000000),
  candidateWindow: z.number().int().min(10).max(50),
  diversifyByLanguage: z.boolean(),
  source: z.literal('github_trending_daily'),
  timezone: z.literal('Asia/Shanghai'),
  scheduleLocalHour: z.literal(8),
  updatedAt: z.string().trim().min(1),
  updatedBy: z.enum(['admin', 'system'])
})

const githubHotDailyConfigUpdateSchema = z.object({
  enabled: z.boolean(),
  interestPreset: z
    .enum([
      'mixed',
      'ai_fun',
      'dev_tools',
      'creative_coding',
      'hardcore_engineering',
      'security',
      'data_ai',
      'mobile_dev',
      'game_dev',
      'design_ux',
      'hardware_iot',
      'browser_extension',
      'productivity'
    ])
    .optional(),
  topicKeywords: z.array(z.string()).optional(),
  excludeKeywords: z.array(z.string()).optional(),
  minStars: z.number().int().min(0).max(10000000).optional(),
  candidateWindow: z.number().int().min(10).max(50).optional(),
  diversifyByLanguage: z.boolean().optional()
})

function normalizeKeywords(topicKeywords: string[]): string[] {
  return Array.from(
    new Set(
      topicKeywords
        .map(keyword => keyword.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 40)
    )
  )
}

export function buildDefaultGithubHotDailyConfig(actor = 'system'): GithubHotDailyConfig {
  return {
    enabled: false,
    interestPreset: 'mixed',
    topicKeywords: [],
    excludeKeywords: [],
    minStars: DEFAULT_MIN_STARS,
    candidateWindow: DEFAULT_CANDIDATE_WINDOW,
    diversifyByLanguage: true,
    source: 'github_trending_daily',
    timezone: SHANGHAI_TIMEZONE,
    scheduleLocalHour: DAILY_SCHEDULE_HOUR,
    updatedAt: new Date().toISOString(),
    updatedBy: actor === 'system' ? 'system' : 'admin'
  }
}

export function parseGithubHotDailyConfig(raw: unknown): GithubHotDailyConfig {
  const compatibility = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const patched = {
    ...buildDefaultGithubHotDailyConfig('system'),
    ...compatibility
  }
  const parsed = githubHotDailyConfigSchema.parse(patched)
  return {
    ...parsed,
    topicKeywords: normalizeKeywords(parsed.topicKeywords),
    excludeKeywords: normalizeKeywords(parsed.excludeKeywords)
  }
}

export function parseGithubHotDailyConfigUpdate(
  raw: unknown,
  current: GithubHotDailyConfig
): Pick<GithubHotDailyConfig, 'enabled' | 'interestPreset' | 'topicKeywords' | 'excludeKeywords' | 'minStars' | 'candidateWindow' | 'diversifyByLanguage'> {
  const parsed = githubHotDailyConfigUpdateSchema.parse(raw)
  return {
    enabled: parsed.enabled,
    interestPreset: parsed.interestPreset || current.interestPreset,
    topicKeywords: normalizeKeywords(parsed.topicKeywords || current.topicKeywords),
    excludeKeywords: normalizeKeywords(parsed.excludeKeywords || current.excludeKeywords),
    minStars: parsed.minStars ?? current.minStars,
    candidateWindow: parsed.candidateWindow ?? current.candidateWindow,
    diversifyByLanguage: parsed.diversifyByLanguage ?? current.diversifyByLanguage
  }
}

export function serializeGithubHotDailyConfig(config: GithubHotDailyConfig): string {
  const normalized: GithubHotDailyConfig = {
    enabled: Boolean(config.enabled),
    interestPreset: config.interestPreset,
    topicKeywords: normalizeKeywords(config.topicKeywords),
    excludeKeywords: normalizeKeywords(config.excludeKeywords),
    minStars: Math.max(0, Math.floor(config.minStars)),
    candidateWindow: Math.min(50, Math.max(10, Math.floor(config.candidateWindow))),
    diversifyByLanguage: Boolean(config.diversifyByLanguage),
    source: 'github_trending_daily',
    timezone: SHANGHAI_TIMEZONE,
    scheduleLocalHour: DAILY_SCHEDULE_HOUR,
    updatedAt: config.updatedAt,
    updatedBy: config.updatedBy
  }

  return `${JSON.stringify(normalized, null, 2)}\n`
}
