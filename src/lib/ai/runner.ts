import { z } from 'zod'
import type {
  AdminLocale,
  AiExecutionStep,
  AiProvider,
  AiTask,
  FrontmatterEnrichPayload,
  TranslatedLocalePayload
} from '@/types/admin'
import { getAiRuntimeConfig, type AiRuntimeConfig } from '@/lib/ai/config'
import { runDeepseekProvider } from '@/lib/ai/provider-deepseek'
import { runGeminiProvider } from '@/lib/ai/provider-gemini'
import { runOpenAiProvider } from '@/lib/ai/provider-openai'
import { runQwenProvider } from '@/lib/ai/provider-qwen'

const frontmatterEnrichSchema = z.object({
  summary: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)).min(1),
  category: z.string().trim().min(1)
})

const translateSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)).min(1),
  category: z.string().trim().min(1),
  markdown: z.string().trim().min(1)
})

type ProviderPromptInput = {
  systemPrompt: string
  userPrompt: string
  signal: AbortSignal
}

type ProviderRunResult = {
  text: string
  model: string
}

type ProviderRunner = (config: AiRuntimeConfig, input: ProviderPromptInput) => Promise<ProviderRunResult>

const providerRunners: Record<AiProvider, ProviderRunner> = {
  gemini: runGeminiProvider,
  openai: runOpenAiProvider,
  deepseek: runDeepseekProvider,
  qwen: runQwenProvider
}

function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map(tag => tag.trim()).filter(Boolean))).slice(0, 8)
}

function isAbortError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'name' in error &&
      typeof (error as { name?: string }).name === 'string' &&
      (error as { name: string }).name === 'AbortError'
  )
}

function compactReason(input: unknown): string {
  const raw = input instanceof Error ? input.message : String(input ?? 'unknown error')
  return raw.replace(/\s+/g, ' ').trim().slice(0, 280) || 'unknown error'
}

function extractJsonPayload(raw: string): unknown {
  const trimmed = raw.trim()
  const fenceRemoved = trimmed.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()
  try {
    return JSON.parse(fenceRemoved)
  } catch {
    const start = fenceRemoved.indexOf('{')
    const end = fenceRemoved.lastIndexOf('}')
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(fenceRemoved.slice(start, end + 1))
    }
    throw new Error('Model response is not valid JSON.')
  }
}

function getProviderModel(config: AiRuntimeConfig, provider: AiProvider): string {
  if (provider === 'gemini') return config.gemini?.model || 'unconfigured'
  if (provider === 'openai') return config.openai?.model || 'unconfigured'
  if (provider === 'deepseek') return config.deepseek?.model || 'unconfigured'
  return config.qwen?.model || 'unconfigured'
}

function hasProviderConfig(config: AiRuntimeConfig, provider: AiProvider): boolean {
  if (provider === 'gemini') return Boolean(config.gemini)
  if (provider === 'openai') return Boolean(config.openai)
  if (provider === 'deepseek') return Boolean(config.deepseek)
  return Boolean(config.qwen)
}

export class AiRunnerError extends Error {
  code: 'AI_CONFIG_ERROR' | 'AI_PROVIDER_UNAVAILABLE' | 'AI_OUTPUT_INVALID' | 'AI_GENERATION_FAILED' | 'AI_TIMEOUT'
  steps: AiExecutionStep[]

  constructor(code: AiRunnerError['code'], message: string, steps: AiExecutionStep[]) {
    super(message)
    this.code = code
    this.steps = steps
  }
}

type AiTaskRunInput<T> = {
  task: AiTask
  locale: AdminLocale
  sourceLocale?: AdminLocale
  schema: z.ZodSchema<T>
  systemPrompt: string
  userPrompt: string
}

async function runAiTaskWithFallback<T>(input: AiTaskRunInput<T>): Promise<{ data: T; steps: AiExecutionStep[] }> {
  const config = getAiRuntimeConfig()

  if (!config.enabled) {
    throw new AiRunnerError('AI_CONFIG_ERROR', 'AI is disabled by AI_ENABLE=false.', [])
  }

  const steps: AiExecutionStep[] = []
  const startedAt = Date.now()
  const maxAttempts = config.retryCount + 1
  let sawConfiguredProvider = false
  let sawOutputInvalid = false
  let sawProviderFailure = false

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    for (const provider of config.providerChain) {
      const model = getProviderModel(config, provider)
      const baseStep: Omit<AiExecutionStep, 'status' | 'reason'> = {
        task: input.task,
        locale: input.locale,
        sourceLocale: input.sourceLocale,
        provider,
        model,
        attempt
      }

      if (!hasProviderConfig(config, provider)) {
        steps.push({
          ...baseStep,
          status: 'skipped',
          reason: 'provider not configured'
        })
        continue
      }

      sawConfiguredProvider = true

      const elapsed = Date.now() - startedAt
      const remaining = config.timeoutMs - elapsed
      if (remaining <= 0) {
        throw new AiRunnerError('AI_TIMEOUT', `AI request timed out after ${config.timeoutMs}ms.`, steps)
      }

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), remaining)

      try {
        const runner = providerRunners[provider]
        const result = await runner(config, {
          systemPrompt: input.systemPrompt,
          userPrompt: input.userPrompt,
          signal: controller.signal
        })

        const parsed = input.schema.safeParse(extractJsonPayload(result.text))
        if (!parsed.success) {
          sawOutputInvalid = true
          steps.push({
            ...baseStep,
            model: result.model || model,
            status: 'failed',
            reason: `output validation failed: ${parsed.error.issues[0]?.message || 'invalid schema'}`
          })
          continue
        }

        steps.push({
          ...baseStep,
          model: result.model || model,
          status: 'success'
        })

        return {
          data: parsed.data,
          steps
        }
      } catch (error) {
        sawProviderFailure = true
        const isTimeout = isAbortError(error)
        steps.push({
          ...baseStep,
          status: 'failed',
          reason: isTimeout ? 'request aborted by timeout' : compactReason(error)
        })

        if (isTimeout && Date.now() - startedAt >= config.timeoutMs) {
          throw new AiRunnerError('AI_TIMEOUT', `AI request timed out after ${config.timeoutMs}ms.`, steps)
        }
      } finally {
        clearTimeout(timer)
      }
    }
  }

  if (!sawConfiguredProvider) {
    throw new AiRunnerError('AI_PROVIDER_UNAVAILABLE', 'No configured AI providers found in AI_PROVIDER_CHAIN.', steps)
  }

  if (sawOutputInvalid && !sawProviderFailure) {
    throw new AiRunnerError('AI_OUTPUT_INVALID', 'AI providers returned invalid structured output.', steps)
  }

  throw new AiRunnerError('AI_GENERATION_FAILED', 'All AI providers failed to generate valid output.', steps)
}

function getSummaryRule(locale: AdminLocale): string {
  if (locale === 'zh') {
    return 'summary 应为约 70-140 个中文字符。'
  }
  return 'summary should be about 40-90 English words.'
}

function buildFrontmatterPrompt(input: {
  locale: AdminLocale
  title: string
  markdown: string
  existingSummary?: string
  existingTags?: string[]
  existingCategory?: string
}): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt:
      'You are a professional technical editor. Return strict JSON only. Never wrap output in markdown fences. Keep language consistent with the target locale.',
    userPrompt: [
      `Task: enrich frontmatter for locale=${input.locale}.`,
      'Generate summary, tags, and category based on the title and markdown body.',
      'Output JSON schema:',
      '{"summary":"string","tags":["string"],"category":"string"}',
      'Rules:',
      `- ${getSummaryRule(input.locale)}`,
      '- tags: 3-6 concise searchable tags, no duplicates.',
      '- category: one concise category phrase.',
      '- Do not include explanations.',
      '',
      `Existing summary: ${input.existingSummary || '<empty>'}`,
      `Existing tags: ${(input.existingTags || []).join(', ') || '<empty>'}`,
      `Existing category: ${input.existingCategory || '<empty>'}`,
      '',
      `Title:\n${input.title}`,
      '',
      `Markdown:\n${input.markdown}`
    ].join('\n')
  }
}

function buildTranslatePrompt(input: {
  sourceLocale: AdminLocale
  targetLocale: AdminLocale
  title: string
  summary?: string
  tags?: string[]
  category?: string
  markdown: string
}): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt:
      'You are a bilingual technical writer. Return strict JSON only. Keep markdown structure, heading levels, links, and code blocks intact.',
    userPrompt: [
      `Task: translate content from ${input.sourceLocale} to ${input.targetLocale}.`,
      'Output JSON schema:',
      '{"title":"string","summary":"string","tags":["string"],"category":"string","markdown":"string"}',
      'Rules:',
      '- Preserve markdown structure and code blocks.',
      '- Translate the title and full markdown body.',
      `- ${getSummaryRule(input.targetLocale)}`,
      '- tags: 3-6 concise tags in target language, no duplicates.',
      '- category: one concise category phrase in target language.',
      '- Do not include explanations.',
      '',
      `Source title:\n${input.title}`,
      '',
      `Source summary:\n${input.summary || '<empty>'}`,
      '',
      `Source tags:\n${(input.tags || []).join(', ') || '<empty>'}`,
      '',
      `Source category:\n${input.category || '<empty>'}`,
      '',
      `Source markdown:\n${input.markdown}`
    ].join('\n')
  }
}

export async function runAiFrontmatterEnrich(input: {
  locale: AdminLocale
  title: string
  markdown: string
  summary?: string
  tags?: string[]
  category?: string
}): Promise<{ payload: FrontmatterEnrichPayload; steps: AiExecutionStep[] }> {
  const prompts = buildFrontmatterPrompt({
    locale: input.locale,
    title: input.title,
    markdown: input.markdown,
    existingSummary: input.summary,
    existingTags: input.tags,
    existingCategory: input.category
  })

  const result = await runAiTaskWithFallback({
    task: 'frontmatter_enrich',
    locale: input.locale,
    schema: frontmatterEnrichSchema,
    systemPrompt: prompts.systemPrompt,
    userPrompt: prompts.userPrompt
  })

  return {
    payload: {
      summary: result.data.summary.trim(),
      tags: normalizeTags(result.data.tags),
      category: result.data.category.trim()
    },
    steps: result.steps
  }
}

export async function runAiTranslate(input: {
  sourceLocale: AdminLocale
  targetLocale: AdminLocale
  title: string
  summary?: string
  tags?: string[]
  category?: string
  markdown: string
}): Promise<{ payload: TranslatedLocalePayload; steps: AiExecutionStep[] }> {
  const prompts = buildTranslatePrompt({
    sourceLocale: input.sourceLocale,
    targetLocale: input.targetLocale,
    title: input.title,
    summary: input.summary,
    tags: input.tags,
    category: input.category,
    markdown: input.markdown
  })

  const result = await runAiTaskWithFallback({
    task: 'translate',
    locale: input.targetLocale,
    sourceLocale: input.sourceLocale,
    schema: translateSchema,
    systemPrompt: prompts.systemPrompt,
    userPrompt: prompts.userPrompt
  })

  return {
    payload: {
      title: result.data.title.trim(),
      summary: result.data.summary.trim(),
      tags: normalizeTags(result.data.tags),
      category: result.data.category.trim(),
      markdown: result.data.markdown.trim()
    },
    steps: result.steps
  }
}

