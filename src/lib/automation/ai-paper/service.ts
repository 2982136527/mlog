import { createHash } from 'node:crypto'
import type { AdminPostPayload, AiExecutionStep } from '@/types/admin'
import type { AiPaperCandidate, AiPaperDailyRunResult, AiPaperEvidence } from '@/types/automation'
import { AdminHttpError } from '@/lib/admin/errors'
import { listContentMarkdownPaths } from '@/lib/admin/github-client'
import { publishPostChanges } from '@/lib/admin/publish-service'
import { loadAiPaperDailyConfig } from '@/lib/automation/ai-paper/config-store'
import { buildAiPaperEvidence } from '@/lib/automation/ai-paper/evidence'
import { validateAiPaperGeneratedPost } from '@/lib/automation/ai-paper/quality'
import { fetchAiPaperCandidates } from '@/lib/automation/ai-paper/sources'
import { AiRunnerError, runAiPaperDailyGenerate } from '@/lib/ai/runner'

const AUTO_POST_PREFIX = 'paper-daily-'
const AUTO_FIXED_TAGS = ['ai-paper', 'paper-daily'] as const
const PAPER_MIN_ZH_CHARS = 1200
const PAPER_REWRITE_RETRY = 1

class PaperQualityError extends Error {
  failedChecks: string[]
  retryCount: number
  steps: AiExecutionStep[]

  constructor(message: string, input: { failedChecks: string[]; retryCount: number; steps: AiExecutionStep[] }) {
    super(message)
    this.failedChecks = input.failedChecks
    this.retryCount = input.retryCount
    this.steps = input.steps
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

function getShanghaiDateParts(now = new Date()): { dateStamp: string; dateIso: string } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })

  const parts = formatter.formatToParts(now)
  const year = parts.find(part => part.type === 'year')?.value || '1970'
  const month = parts.find(part => part.type === 'month')?.value || '01'
  const day = parts.find(part => part.type === 'day')?.value || '01'

  return {
    dateStamp: `${year}${month}${day}`,
    dateIso: `${year}-${month}-${day}`
  }
}

function extractSlug(path: string): string | null {
  const matched = path.match(/^content\/posts\/([^/]+)\/(zh|en)\.md$/)
  return matched ? matched[1] : null
}

function normalizeArxivId(input: string): string {
  return input.trim().toLowerCase().replace(/v\d+$/i, '')
}

function sanitizePaperKey(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return normalized.slice(0, 56) || 'paper'
}

function buildPaperHash(arxivId: string): string {
  return createHash('sha1').update(normalizeArxivId(arxivId)).digest('hex').slice(0, 8)
}

function buildPaperSlug(input: { dateStamp: string; title: string; arxivId: string }): { slug: string; paperHash: string } {
  const paperHash = buildPaperHash(input.arxivId)
  const paperKey = sanitizePaperKey(input.title)
  return {
    slug: `${AUTO_POST_PREFIX}${input.dateStamp}-${paperKey}-${paperHash}`,
    paperHash
  }
}

function extractPaperHashes(slugs: Iterable<string>): Set<string> {
  const hashes = new Set<string>()
  for (const slug of slugs) {
    const matched = slug.match(/^paper-daily-\d{8}-[a-z0-9-]+-([a-f0-9]{8})$/)
    if (matched) {
      hashes.add(matched[1])
    }
  }
  return hashes
}

async function generateAiPaperWithQuality(input: {
  dateIso: string
  evidence: AiPaperEvidence
}): Promise<{
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
}> {
  const failedChecksAll: string[] = []
  let retryCount = 0
  let qualityFeedback: string[] | undefined
  let allSteps: AiExecutionStep[] = []

  while (retryCount <= PAPER_REWRITE_RETRY) {
    let generated: Awaited<ReturnType<typeof runAiPaperDailyGenerate>>
    try {
      generated = await runAiPaperDailyGenerate({
        locale: 'zh',
        dateIso: input.dateIso,
        evidence: input.evidence,
        qualityFeedback
      })
    } catch (error) {
      mapAiErrorToAdmin(error)
    }

    allSteps = [...allSteps, ...generated.steps]
    const qualityResult = validateAiPaperGeneratedPost({
      markdown: generated.payload.markdown,
      evidence: input.evidence,
      minChineseChars: PAPER_MIN_ZH_CHARS
    })

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
    if (retryCount >= PAPER_REWRITE_RETRY) {
      throw new PaperQualityError('Generated ai-paper draft failed quality checks.', {
        failedChecks: qualityResult.failedChecks,
        retryCount,
        steps: allSteps
      })
    }

    qualityFeedback = qualityResult.failedChecks
    retryCount += 1
  }

  throw new PaperQualityError('Generated ai-paper draft failed quality checks.', {
    failedChecks: ['unknown quality failure'],
    retryCount,
    steps: allSteps
  })
}

function filterBySignals(candidates: AiPaperCandidate[], minSignalsScore: number): AiPaperCandidate[] {
  const filtered = candidates.filter(candidate => candidate.signalsScore >= minSignalsScore)
  return filtered.length > 0 ? filtered : candidates
}

export async function runAiPaperDailyAutomation(input: {
  actor: string
  requestId: string
  bypassEnabled?: boolean
}): Promise<AiPaperDailyRunResult> {
  const { dateStamp, dateIso } = getShanghaiDateParts()
  const { config } = await loadAiPaperDailyConfig()
  const runMeta = {
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

  const existingPaths = await listContentMarkdownPaths()
  const slugSet = new Set(existingPaths.map(extractSlug).filter(Boolean) as string[])
  const todayExists = Array.from(slugSet).some(slug => slug.startsWith(`${AUTO_POST_PREFIX}${dateStamp}-`))
  if (todayExists) {
    return {
      status: 'SKIPPED_ALREADY_PUBLISHED_TODAY',
      dateStamp,
      dateIso,
      ...runMeta,
      reason: `post already exists for ${dateStamp}`
    }
  }

  let candidates: AiPaperCandidate[]
  try {
    candidates = await fetchAiPaperCandidates({
      arxivCategories: config.arxivCategories,
      maxCandidates: config.maxCandidates,
      includeCodeFirst: config.includeCodeFirst
    })
  } catch (error) {
    return {
      status: 'SKIPPED_FETCH_FAILED',
      dateStamp,
      dateIso,
      ...runMeta,
      reason: error instanceof Error ? error.message : 'failed to fetch paper candidates'
    }
  }

  const candidatesBySignal = filterBySignals(candidates, config.minSignalsScore)
  if (candidatesBySignal.length === 0) {
    return {
      status: 'SKIPPED_NO_CANDIDATE',
      dateStamp,
      dateIso,
      ...runMeta,
      reason: 'no paper candidate'
    }
  }

  const usedHashes = extractPaperHashes(slugSet)
  for (const candidate of candidatesBySignal) {
    const { slug, paperHash } = buildPaperSlug({
      dateStamp,
      title: candidate.title,
      arxivId: candidate.arxivId
    })
    if (usedHashes.has(paperHash) || slugSet.has(slug)) {
      continue
    }

    const evidence = buildAiPaperEvidence(candidate)
    let generated: Awaited<ReturnType<typeof generateAiPaperWithQuality>>
    try {
      generated = await generateAiPaperWithQuality({
        dateIso,
        evidence
      })
    } catch (error) {
      if (error instanceof PaperQualityError) {
        return {
          status: 'SKIPPED_QUALITY_FAILED',
          dateStamp,
          dateIso,
          ...runMeta,
          selectedPaper: {
            arxivId: candidate.arxivId,
            title: candidate.title,
            paperUrl: candidate.paperUrl,
            ...(candidate.pwcUrl ? { pwcUrl: candidate.pwcUrl } : {})
          },
          ai: {
            triggered: true,
            mode: 'publish',
            steps: error.steps
          },
          quality: {
            passed: false,
            retryCount: error.retryCount,
            failedChecks: error.failedChecks
          },
          evidence: {
            sourceCount: evidence.sourceUrls.length
          },
          reason: 'quality gate failed'
        }
      }
      throw error
    }

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

    return {
      status: 'PUBLISHED',
      dateStamp,
      dateIso,
      ...runMeta,
      slug,
      selectedPaper: {
        arxivId: candidate.arxivId,
        title: candidate.title,
        paperUrl: candidate.paperUrl,
        ...(candidate.pwcUrl ? { pwcUrl: candidate.pwcUrl } : {})
      },
      changedPaths: published.changedPaths,
      publish: published.result,
      ai: published.ai,
      quality: generated.quality,
      evidence: {
        sourceCount: evidence.sourceUrls.length
      }
    }
  }

  return {
    status: 'SKIPPED_NO_CANDIDATE',
    dateStamp,
    dateIso,
    ...runMeta,
    reason: 'all candidates filtered by history dedupe'
  }
}
