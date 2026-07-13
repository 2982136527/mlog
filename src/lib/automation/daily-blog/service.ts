import { createHash } from 'node:crypto'
import type { AdminPostPayload } from '@/types/admin'
import type { AiExecutionStep } from '@/types/admin'
import type {
  AutomationTriggerSource,
  DailyBlogConfig,
  DailyBlogRunResult
} from '@/types/automation'
import { AdminHttpError } from '@/lib/admin/errors'
import { listAllContentMarkdownPaths } from '@/lib/admin/shard-manager'
import { publishPostChanges } from '@/lib/admin/publish-service'
import { AiRunnerError, runAiUserTopicPostGenerate } from '@/lib/ai/runner'
import { getAiRuntimeConfig } from '@/lib/ai/config'
import { DAILY_BLOG_SLUG_PREFIX } from '@/lib/automation/daily-blog/config'
import { loadDailyBlogConfig } from '@/lib/automation/daily-blog/config-store'
import {
  getShanghaiDateContext,
  hasPublishedTodayByPrefix
} from '@/lib/automation/daily-health'

const AUTO_POST_PREFIX = DAILY_BLOG_SLUG_PREFIX
const AUTO_FIXED_TAGS = ['ai-auto', 'daily-blog'] as const
const DAILY_BLOG_REWRITE_RETRY = 1

type GeneratedWithQuality = {
  payload: {
    title: string
    summary: string
    tags: string[]
    category: string
    markdown: string
  }
  steps: AiExecutionStep[]
  quality: {
    passed: boolean
    retryCount: number
    failedChecks: string[]
  }
}

function mapAiErrorToAdmin(error: unknown): never {
  if (error instanceof AiRunnerError) {
    const statusMap: Record<AiRunnerError['code'], number> = {
      AI_CONFIG_ERROR: 500,
      AI_PROVIDER_UNAVAILABLE: 502,
      AI_OUTPUT_INVALID: 502,
      AI_GENERATION_FAILED: 502,
      AI_TIMEOUT: 504
    }
    throw new AdminHttpError(statusMap[error.code], error.code, error.message, {
      steps: error.steps
    })
  }
  throw error
}

export function pickDailyBlogTopic(config: DailyBlogConfig, dateStamp: string): { topic: string; source: 'custom' | 'category' } | null {
  const allTopics: string[] = []
  const excluded = new Set(config.excludeTopics)

  for (const cat of config.topicCategories) {
    if (!excluded.has(cat)) {
      allTopics.push(cat)
    }
  }

  for (const topic of config.customTopics) {
    if (!excluded.has(topic)) {
      allTopics.push(topic)
    }
  }

  if (allTopics.length === 0) return null

  const seed = `${dateStamp}|${allTopics.join(',')}`
  const hash = createHash('sha1').update(seed).digest('hex')
  const index = parseInt(hash.slice(0, 8), 16) % allTopics.length
  const selected = allTopics[index]

  const source: 'custom' | 'category' = config.customTopics.includes(selected) ? 'custom' : 'category'

  return { topic: selected, source }
}

export function buildDailyBlogSlug(dateStamp: string, topic: string): string {
  const topicKey = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)

  const hash = createHash('sha1').update(`${dateStamp}|${topic}`).digest('hex').slice(0, 6)
  const topicSegment = topicKey ? `-${topicKey}` : ''
  return `${AUTO_POST_PREFIX}${dateStamp}${topicSegment}-${hash}`
}

function validateDailyBlogPost(markdown: string, minChars: number, maxChars: number): { passed: boolean; failedChecks: string[] } {
  const failedChecks: string[] = []

  const textOnly = markdown.replace(/[#*`>\-\s\[\]()!|~]/g, '').trim()
  const chineseChars = (textOnly.match(/[\u4e00-\u9fff]/g) || []).length

  if (chineseChars < minChars) {
    failedChecks.push(`文章中文字数不足：${chineseChars} < ${minChars}`)
  }
  if (chineseChars > maxChars) {
    failedChecks.push(`文章中文字数超出上限：${chineseChars} > ${maxChars}`)
  }

  const hasHeadings = /^#{1,3}\s/m.test(markdown)
  if (!hasHeadings) {
    failedChecks.push('文章缺少标题结构（H1-H3）')
  }

  return {
    passed: failedChecks.length === 0,
    failedChecks
  }
}

async function generateDailyBlogPost(input: {
  dateIso: string
  topic: string
  minLength: number
  maxLength: number
}): Promise<GeneratedWithQuality> {
  const failedChecksAll: string[] = []
  let retryCount = 0
  let qualityFeedback: string[] | undefined
  let allSteps: AiExecutionStep[] = []

  const aiConfig = getAiRuntimeConfig()

  while (retryCount <= DAILY_BLOG_REWRITE_RETRY) {
    let generated: Awaited<ReturnType<typeof runAiUserTopicPostGenerate>>
    try {
      generated = await runAiUserTopicPostGenerate({
        locale: 'zh',
        dateIso: input.dateIso,
        topic: input.topic,
        minLength: input.minLength,
        maxLength: input.maxLength,
        qualityFeedback,
        runtimeConfig: aiConfig
      })
    } catch (error) {
      mapAiErrorToAdmin(error)
    }

    allSteps = [...allSteps, ...generated.steps]

    const qualityResult = validateDailyBlogPost(generated.payload.markdown, input.minLength, input.maxLength)

    if (qualityResult.passed) {
      return {
        payload: generated.payload,
        steps: allSteps,
        quality: {
          passed: true,
          retryCount,
          failedChecks: failedChecksAll
        }
      }
    }

    failedChecksAll.push(...qualityResult.failedChecks)
    if (retryCount >= DAILY_BLOG_REWRITE_RETRY) {
      throw new AdminHttpError(502, 'AI_OUTPUT_INVALID', 'Generated article failed quality checks.', {
        failedChecks: qualityResult.failedChecks
      })
    }

    qualityFeedback = qualityResult.failedChecks
    retryCount += 1
  }

  throw new AdminHttpError(502, 'AI_GENERATION_FAILED', 'AI generation failed in quality rewrite loop.')
}

export async function runDailyBlogAutomation(input: {
  actor: string
  requestId: string
  bypassEnabled?: boolean
  forceRunToday?: boolean
  triggerSource?: AutomationTriggerSource
}): Promise<DailyBlogRunResult> {
  const { dateStamp, dateIso } = getShanghaiDateContext()
  const { config } = await loadDailyBlogConfig()
  const triggerSource = input.triggerSource || 'admin_manual'

  const runMeta = {
    triggerSource,
    fixedTags: [...AUTO_FIXED_TAGS]
  }

  if (!input.bypassEnabled && !config.enabled) {
    return {
      status: 'SKIPPED_DISABLED',
      dateStamp,
      dateIso,
      ...runMeta,
      reason: 'automation disabled'
    }
  }

  const existingPaths = Array.from((await listAllContentMarkdownPaths()).keys())
  const todayExists = hasPublishedTodayByPrefix(existingPaths, AUTO_POST_PREFIX, dateStamp)

  if (todayExists && !input.forceRunToday) {
    return {
      status: 'SKIPPED_ALREADY_PUBLISHED_TODAY',
      dateStamp,
      dateIso,
      ...runMeta,
      reason: `post already exists for ${dateStamp}`
    }
  }

  const topicResult = pickDailyBlogTopic(config, dateStamp)
  if (!topicResult) {
    return {
      status: 'SKIPPED_NO_TOPIC',
      dateStamp,
      dateIso,
      ...runMeta,
      reason: 'no available topics'
    }
  }

  const slug = buildDailyBlogSlug(dateStamp, topicResult.topic)

  const generated = await generateDailyBlogPost({
    dateIso,
    topic: topicResult.topic,
    minLength: config.minLength,
    maxLength: config.maxLength
  })

  const changes: AdminPostPayload[] = [
    {
      locale: 'zh',
      frontmatter: {
        title: generated.payload.title,
        date: dateIso,
        summary: generated.payload.summary,
        tags: generated.payload.tags,
        category: generated.payload.category,
        draft: false,
        updated: dateIso
      },
      markdown: generated.payload.markdown,
      baseSha: null
    }
  ]

  const published = await publishPostChanges({
    slug,
    mode: 'publish',
    changes,
    actor: input.actor,
    requestId: input.requestId,
    forcedTags: [...AUTO_FIXED_TAGS]
  })
  const merged = published.result.merged
  const refreshPending = merged && (!published.result.branchSynchronized || !published.result.cacheInvalidated)

  return {
    status: !merged ? 'PENDING_REVIEW' : refreshPending ? 'REFRESH_PENDING' : 'PUBLISHED',
    dateStamp,
    dateIso,
    triggerSource,
    slug,
    selectedTopic: topicResult.topic,
    topicSource: topicResult.source,
    ...(!merged
      ? { reason: published.result.mergeMessage || 'post PR is awaiting review' }
      : refreshPending
        ? { reason: 'post merged, but branch visibility or runtime cache refresh is pending' }
        : {}),
    changedPaths: published.changedPaths,
    publish: published.result,
    fixedTags: [...AUTO_FIXED_TAGS],
    quality: generated.quality,
    ai: {
      triggered: true,
      mode: 'publish',
      steps: [...generated.steps, ...published.ai.steps]
    }
  }
}
