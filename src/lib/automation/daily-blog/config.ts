import { z } from 'zod'
import type { DailyBlogConfig } from '@/types/automation'

export const DAILY_BLOG_CONFIG_PATH = 'content/system/automation/daily-blog.json'
export const SHANGHAI_TIMEZONE = 'Asia/Shanghai'
export const DAILY_SCHEDULE_HOUR = 9 as const
export const BACKFILL_SCHEDULE_HOUR = 11 as const
export const DAILY_BLOG_SLUG_PREFIX = 'daily-blog-' as const

export const TOPIC_CATEGORIES = [
  '技术思考',
  '开发实践',
  '工具推荐',
  '学习笔记',
  '生活感悟',
  '行业观察',
  '效率提升',
  '创意分享',
  '问题解决',
  '经验总结'
] as const

export const DEFAULT_TOPICS = [
  'AI在日常开发中的应用',
  '现代前端开发趋势',
  '个人知识管理方法',
  '远程工作的效率工具',
  '开源项目的维护经验',
  '技术学习的有效路径',
  '代码质量与可维护性',
  '开发者职业发展',
  '技术团队协作',
  '创新项目的启动与管理'
]

const dailyBlogConfigSchema = z.object({
  enabled: z.boolean(),
  topicCategories: z.array(z.string()),
  customTopics: z.array(z.string()),
  excludeTopics: z.array(z.string()),
  minLength: z.number().int().min(500).max(5000),
  maxLength: z.number().int().min(1000).max(8000),
  source: z.literal('ai_generated_daily'),
  timezone: z.literal('Asia/Shanghai'),
  scheduleLocalHour: z.literal(9),
  updatedAt: z.string().trim().min(1),
  updatedBy: z.enum(['admin', 'system'])
}).refine(config => config.minLength <= config.maxLength, {
  path: ['maxLength'],
  message: 'maxLength must be greater than or equal to minLength'
})

const dailyBlogConfigUpdateSchema = z.object({
  enabled: z.boolean(),
  topicCategories: z.array(z.string()).optional(),
  customTopics: z.array(z.string()).optional(),
  excludeTopics: z.array(z.string()).optional(),
  minLength: z.number().int().min(500).max(5000).optional(),
  maxLength: z.number().int().min(1000).max(8000).optional()
})

function normalizeTopics(topics: string[]): string[] {
  return Array.from(
    new Set(
      topics
        .map(topic => topic.trim())
        .filter(Boolean)
        .slice(0, 50)
    )
  )
}

export function buildDefaultDailyBlogConfig(actor = 'system'): DailyBlogConfig {
  return {
    enabled: false,
    topicCategories: [...TOPIC_CATEGORIES],
    customTopics: [...DEFAULT_TOPICS],
    excludeTopics: [],
    minLength: 1200,
    maxLength: 2500,
    source: 'ai_generated_daily',
    timezone: SHANGHAI_TIMEZONE,
    scheduleLocalHour: DAILY_SCHEDULE_HOUR,
    updatedAt: new Date().toISOString(),
    updatedBy: actor === 'system' ? 'system' : 'admin'
  }
}

export function parseDailyBlogConfig(raw: unknown): DailyBlogConfig {
  const compatibility = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const patched = {
    ...buildDefaultDailyBlogConfig('system'),
    ...compatibility
  }
  const parsed = dailyBlogConfigSchema.parse(patched)
  return {
    ...parsed,
    topicCategories: normalizeTopics(parsed.topicCategories),
    customTopics: normalizeTopics(parsed.customTopics),
    excludeTopics: normalizeTopics(parsed.excludeTopics)
  }
}

export function parseDailyBlogConfigUpdate(
  raw: unknown,
  current: DailyBlogConfig
): Pick<DailyBlogConfig, 'enabled' | 'topicCategories' | 'customTopics' | 'excludeTopics' | 'minLength' | 'maxLength'> {
  const parsed = dailyBlogConfigUpdateSchema.parse(raw)
  const next = dailyBlogConfigSchema.parse({
    ...current,
    ...parsed,
    topicCategories: normalizeTopics(parsed.topicCategories || current.topicCategories),
    customTopics: normalizeTopics(parsed.customTopics || current.customTopics),
    excludeTopics: normalizeTopics(parsed.excludeTopics || current.excludeTopics)
  })
  return {
    enabled: next.enabled,
    topicCategories: next.topicCategories,
    customTopics: next.customTopics,
    excludeTopics: next.excludeTopics,
    minLength: next.minLength,
    maxLength: next.maxLength
  }
}

export function serializeDailyBlogConfig(config: DailyBlogConfig): string {
  const normalized: DailyBlogConfig = {
    enabled: Boolean(config.enabled),
    topicCategories: normalizeTopics(config.topicCategories),
    customTopics: normalizeTopics(config.customTopics),
    excludeTopics: normalizeTopics(config.excludeTopics),
    minLength: Math.min(5000, Math.max(500, Math.floor(config.minLength))),
    maxLength: Math.min(8000, Math.max(1000, Math.floor(config.maxLength))),
    source: 'ai_generated_daily',
    timezone: SHANGHAI_TIMEZONE,
    scheduleLocalHour: DAILY_SCHEDULE_HOUR,
    updatedAt: config.updatedAt,
    updatedBy: config.updatedBy
  }

  return `${JSON.stringify(normalized, null, 2)}\n`
}
