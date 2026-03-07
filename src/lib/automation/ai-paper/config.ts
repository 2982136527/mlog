import { z } from 'zod'
import type { AiPaperDailyConfig } from '@/types/automation'

export const AI_PAPER_DAILY_CONFIG_PATH = 'content/system/automation/ai-paper-daily.json'
export const AI_PAPER_DAILY_TIMEZONE = 'Asia/Shanghai'
export const AI_PAPER_DAILY_SCHEDULE_TIME = '12:30' as const
export const AI_PAPER_DAILY_BACKFILL_TIME = '14:30' as const
export const AI_PAPER_DAILY_SLUG_PREFIX = 'paper-daily-' as const
export const AI_PAPER_DAILY_DEFAULT_MAX_CANDIDATES = 30
export const AI_PAPER_DAILY_DEFAULT_CATEGORIES = ['cs.AI', 'cs.LG', 'cs.CL', 'stat.ML']

const aiPaperDailyConfigSchema = z.object({
  enabled: z.boolean(),
  source: z.literal('arxiv_pwc'),
  timezone: z.literal('Asia/Shanghai'),
  scheduleLocalTime: z.literal('12:30'),
  arxivCategories: z.array(z.string().trim().min(1)).min(1).max(20),
  maxCandidates: z.number().int().min(5).max(50),
  minSignalsScore: z.number().min(0).max(100),
  includeCodeFirst: z.boolean(),
  updatedAt: z.string().trim().min(1),
  updatedBy: z.enum(['admin', 'system'])
})

const aiPaperDailyConfigUpdateSchema = z.object({
  enabled: z.boolean(),
  arxivCategories: z.array(z.string()).optional(),
  maxCandidates: z.number().int().min(5).max(50).optional(),
  minSignalsScore: z.number().min(0).max(100).optional(),
  includeCodeFirst: z.boolean().optional()
})

function normalizeArxivCategories(items: string[]): string[] {
  return Array.from(
    new Set(
      items
        .map(item => item.trim())
        .filter(Boolean)
        .map(item => item.replace(/\s+/g, ''))
        .slice(0, 20)
    )
  )
}

export function buildDefaultAiPaperDailyConfig(actor = 'system'): AiPaperDailyConfig {
  return {
    enabled: false,
    source: 'arxiv_pwc',
    timezone: AI_PAPER_DAILY_TIMEZONE,
    scheduleLocalTime: AI_PAPER_DAILY_SCHEDULE_TIME,
    arxivCategories: [...AI_PAPER_DAILY_DEFAULT_CATEGORIES],
    maxCandidates: AI_PAPER_DAILY_DEFAULT_MAX_CANDIDATES,
    minSignalsScore: 0,
    includeCodeFirst: true,
    updatedAt: new Date().toISOString(),
    updatedBy: actor === 'system' ? 'system' : 'admin'
  }
}

export function parseAiPaperDailyConfig(raw: unknown): AiPaperDailyConfig {
  const compatibility = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const parsed = aiPaperDailyConfigSchema.parse({
    ...buildDefaultAiPaperDailyConfig('system'),
    ...compatibility
  })

  return {
    ...parsed,
    arxivCategories: normalizeArxivCategories(parsed.arxivCategories)
  }
}

export function parseAiPaperDailyConfigUpdate(
  raw: unknown,
  current: AiPaperDailyConfig
): Pick<AiPaperDailyConfig, 'enabled' | 'arxivCategories' | 'maxCandidates' | 'minSignalsScore' | 'includeCodeFirst'> {
  const parsed = aiPaperDailyConfigUpdateSchema.parse(raw)
  return {
    enabled: parsed.enabled,
    arxivCategories: normalizeArxivCategories(parsed.arxivCategories || current.arxivCategories),
    maxCandidates: parsed.maxCandidates ?? current.maxCandidates,
    minSignalsScore: parsed.minSignalsScore ?? current.minSignalsScore,
    includeCodeFirst: parsed.includeCodeFirst ?? current.includeCodeFirst
  }
}

export function serializeAiPaperDailyConfig(config: AiPaperDailyConfig): string {
  const normalized: AiPaperDailyConfig = {
    enabled: Boolean(config.enabled),
    source: 'arxiv_pwc',
    timezone: AI_PAPER_DAILY_TIMEZONE,
    scheduleLocalTime: AI_PAPER_DAILY_SCHEDULE_TIME,
    arxivCategories: normalizeArxivCategories(config.arxivCategories),
    maxCandidates: Math.min(50, Math.max(5, Math.trunc(config.maxCandidates))),
    minSignalsScore: Math.min(100, Math.max(0, config.minSignalsScore)),
    includeCodeFirst: Boolean(config.includeCodeFirst),
    updatedAt: config.updatedAt,
    updatedBy: config.updatedBy
  }

  return `${JSON.stringify(normalized, null, 2)}\n`
}
