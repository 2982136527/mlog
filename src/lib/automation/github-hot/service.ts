import { createHash } from 'node:crypto'
import type { AdminPostPayload } from '@/types/admin'
import type {
  CandidateSelectionMode,
  GithubHotCandidateScore,
  GithubHotCandidatesPreviewResult,
  GithubHotDailyConfig,
  GithubHotDailyRunResult,
  GithubHotRepoCandidate
} from '@/types/automation'
import { listContentMarkdownPaths } from '@/lib/admin/github-client'
import { publishPostChanges } from '@/lib/admin/publish-service'
import { INTEREST_PRESET_KEYWORDS } from '@/lib/automation/github-hot/config'
import { loadGithubHotDailyConfig } from '@/lib/automation/github-hot/config-store'
import { fetchGithubTrendingCandidates } from '@/lib/automation/github-hot/trending'
import { runAiGithubHotPostGenerate } from '@/lib/ai/runner'

const AUTO_POST_PREFIX = 'gh-hot-'

type SelectionContext = {
  selectionMode: CandidateSelectionMode
  presetKeywords: string[]
  overlayKeywords: string[]
  effectiveKeywords: string[]
  randomSeedDate: string | null
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

function sanitizeRepoKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)
}

function buildRepoHash(fullName: string): string {
  return createHash('sha1').update(fullName.toLowerCase()).digest('hex').slice(0, 8)
}

function extractRepoHashes(slugs: Iterable<string>): Set<string> {
  const hashes = new Set<string>()
  for (const slug of slugs) {
    const matched = slug.match(/^gh-hot-\d{8}-[a-z0-9-]+-([a-f0-9]{8})$/)
    if (matched) {
      hashes.add(matched[1])
    }
  }
  return hashes
}

function normalizeKeywords(items: string[]): string[] {
  return Array.from(new Set(items.map(item => item.trim().toLowerCase()).filter(Boolean)))
}

function getSearchSpace(candidate: GithubHotRepoCandidate): string {
  return [candidate.fullName, candidate.repo, candidate.description, candidate.language, ...candidate.topics].join(' ').toLowerCase()
}

function buildSelectionContext(config: GithubHotDailyConfig, dateStamp: string): SelectionContext {
  const presetKeywords = normalizeKeywords(INTEREST_PRESET_KEYWORDS[config.interestPreset] || [])
  const overlayKeywords = normalizeKeywords(config.topicKeywords)
  const selectionMode: CandidateSelectionMode = overlayKeywords.length > 0 ? 'scored_keyword' : 'theme_random_seeded'
  const effectiveKeywords = selectionMode === 'scored_keyword' ? normalizeKeywords([...presetKeywords, ...overlayKeywords]) : presetKeywords

  return {
    selectionMode,
    presetKeywords,
    overlayKeywords,
    effectiveKeywords,
    randomSeedDate: selectionMode === 'theme_random_seeded' ? dateStamp : null
  }
}

function applyBaseCandidateFilter(candidates: GithubHotRepoCandidate[], config: GithubHotDailyConfig, excludeKeywords: string[]): GithubHotRepoCandidate[] {
  const minStars = Math.max(0, config.minStars)
  const narrowedByStars = candidates.filter(candidate => candidate.stars >= minStars)
  const basePool = narrowedByStars.length > 0 ? narrowedByStars : candidates

  return basePool.filter(candidate => {
    const searchSpace = getSearchSpace(candidate)
    return !excludeKeywords.some(keyword => searchSpace.includes(keyword))
  })
}

function selectCandidatePool(
  candidates: GithubHotRepoCandidate[],
  selectionContext: SelectionContext
): { selectedPool: GithubHotRepoCandidate[]; usedTopicFallback: boolean } {
  if (candidates.length === 0) {
    return {
      selectedPool: [],
      usedTopicFallback: false
    }
  }

  if (selectionContext.effectiveKeywords.length === 0) {
    return {
      selectedPool: candidates,
      usedTopicFallback: false
    }
  }

  const matched = candidates.filter(candidate => {
    const searchSpace = getSearchSpace(candidate)
    return selectionContext.effectiveKeywords.some(keyword => searchSpace.includes(keyword))
  })

  if (matched.length > 0) {
    return {
      selectedPool: matched,
      usedTopicFallback: false
    }
  }

  return {
    selectedPool: candidates,
    usedTopicFallback: true
  }
}

function buildSeededRandomScore(input: {
  candidate: GithubHotRepoCandidate
  config: GithubHotDailyConfig
  randomSeedDate: string
  excludeKeywords: string[]
}): { score: number; hash: string } {
  const seed = [
    input.randomSeedDate,
    input.config.interestPreset,
    String(Math.max(0, input.config.minStars)),
    String(Math.min(50, Math.max(10, input.config.candidateWindow))),
    input.excludeKeywords.join(','),
    input.candidate.fullName.toLowerCase()
  ].join('|')

  const hash = createHash('sha1').update(seed).digest('hex').slice(0, 8)
  const score = Number(((parseInt(hash, 16) / 0xffffffff) * 100).toFixed(6))
  return { score, hash }
}

function buildCandidateScores(
  candidates: GithubHotRepoCandidate[],
  config: GithubHotDailyConfig,
  selectionContext: SelectionContext,
  excludeKeywords: string[],
  usedTopicFallback: boolean
): Array<GithubHotRepoCandidate & { scoreInfo: GithubHotCandidateScore }> {
  if (selectionContext.selectionMode === 'theme_random_seeded') {
    return candidates
      .map(candidate => {
        const searchSpace = getSearchSpace(candidate)
        const matchedKeywords = selectionContext.effectiveKeywords.filter(keyword => searchSpace.includes(keyword))
        const hitExcludeKeywords = excludeKeywords.filter(keyword => searchSpace.includes(keyword))
        const randomSeedDate = selectionContext.randomSeedDate || '19700101'
        const random = buildSeededRandomScore({
          candidate,
          config,
          randomSeedDate,
          excludeKeywords
        })

        const reason: string[] = [`seeded-random(${randomSeedDate})`, `hash:${random.hash}`]
        if (matchedKeywords.length > 0) {
          reason.push(`theme-hit:${matchedKeywords.join('|')}`)
        }
        if (usedTopicFallback) {
          reason.push('fallback:theme-pool-empty')
        }
        if (hitExcludeKeywords.length > 0) {
          reason.push(`exclude-hit:${hitExcludeKeywords.join('|')}`)
        }

        return {
          ...candidate,
          scoreInfo: {
            fullName: candidate.fullName,
            rank: candidate.rank,
            stars: candidate.stars,
            language: candidate.language,
            matchedKeywords,
            hitExcludeKeywords,
            score: random.score,
            reason
          }
        }
      })
      .sort((a, b) => b.scoreInfo.score - a.scoreInfo.score || a.rank - b.rank)
  }

  const languageFrequency = new Map<string, number>()
  for (const candidate of candidates) {
    const key = candidate.language.trim().toLowerCase() || 'unknown'
    languageFrequency.set(key, (languageFrequency.get(key) || 0) + 1)
  }

  return candidates
    .map(candidate => {
      const searchSpace = getSearchSpace(candidate)
      const matchedKeywords = selectionContext.effectiveKeywords.filter(keyword => searchSpace.includes(keyword))
      const hitExcludeKeywords = excludeKeywords.filter(keyword => searchSpace.includes(keyword))
      const languageKey = candidate.language.trim().toLowerCase() || 'unknown'

      const rankScore = Math.max(0, config.candidateWindow - candidate.rank + 1) * 3
      const starsScore = Math.log10(candidate.stars + 1) * 10
      const keywordScore = matchedKeywords.length * 8
      const fallbackPenalty = usedTopicFallback ? 4 : 0
      const languagePenalty = config.diversifyByLanguage ? Math.max(0, (languageFrequency.get(languageKey) || 0) - 1) * 2 : 0
      const finalScore = Number((rankScore + starsScore + keywordScore - fallbackPenalty - languagePenalty).toFixed(2))

      const reason: string[] = [
        `rank+${rankScore.toFixed(1)}`,
        `stars+${starsScore.toFixed(1)}`,
        `keyword+${keywordScore.toFixed(1)}`
      ]
      if (fallbackPenalty > 0) {
        reason.push(`fallback-${fallbackPenalty.toFixed(1)}`)
      }
      if (languagePenalty > 0) {
        reason.push(`lang-diversity-${languagePenalty.toFixed(1)}`)
      }
      if (hitExcludeKeywords.length > 0) {
        reason.push(`exclude-hit:${hitExcludeKeywords.join('|')}`)
      }

      return {
        ...candidate,
        scoreInfo: {
          fullName: candidate.fullName,
          rank: candidate.rank,
          stars: candidate.stars,
          language: candidate.language,
          matchedKeywords,
          hitExcludeKeywords,
          score: finalScore,
          reason
        }
      }
    })
    .sort((a, b) => b.scoreInfo.score - a.scoreInfo.score || a.rank - b.rank)
}

export async function previewGithubHotCandidates(input?: {
  overrideConfig?: GithubHotDailyConfig
}): Promise<GithubHotCandidatesPreviewResult> {
  const { dateStamp, dateIso } = getShanghaiDateParts()
  const config = input?.overrideConfig || (await loadGithubHotDailyConfig()).config
  const candidates = await fetchGithubTrendingCandidates(config.candidateWindow)
  const selectionContext = buildSelectionContext(config, dateStamp)
  const excludeKeywords = normalizeKeywords(config.excludeKeywords)
  const basePool = applyBaseCandidateFilter(candidates, config, excludeKeywords)
  const { selectedPool, usedTopicFallback } = selectCandidatePool(basePool, selectionContext)
  const scored = buildCandidateScores(selectedPool, config, selectionContext, excludeKeywords, usedTopicFallback)

  return {
    dateStamp,
    dateIso,
    usedTopicFallback,
    selectionMode: selectionContext.selectionMode,
    presetKeywords: selectionContext.presetKeywords,
    overlayKeywords: selectionContext.overlayKeywords,
    effectiveKeywords: selectionContext.effectiveKeywords,
    randomSeedDate: selectionContext.randomSeedDate,
    excludeKeywords,
    candidates: scored
  }
}

function buildAutoSlug(input: { dateStamp: string; fullName: string; owner: string; repo: string }): { slug: string; repoHash: string } {
  const repoHash = buildRepoHash(input.fullName)
  const repoKey = sanitizeRepoKey(`${input.owner}-${input.repo}`) || 'repo'
  return {
    slug: `${AUTO_POST_PREFIX}${input.dateStamp}-${repoKey}-${repoHash}`,
    repoHash
  }
}

export async function runGithubHotDailyAutomation(input: {
  actor: string
  requestId: string
  bypassEnabled?: boolean
}): Promise<GithubHotDailyRunResult> {
  const { dateStamp, dateIso } = getShanghaiDateParts()
  const { config } = await loadGithubHotDailyConfig()
  const selectionContext = buildSelectionContext(config, dateStamp)
  const runMeta = {
    selectionMode: selectionContext.selectionMode,
    presetKeywords: selectionContext.presetKeywords,
    overlayKeywords: selectionContext.overlayKeywords,
    effectiveKeywords: selectionContext.effectiveKeywords,
    randomSeedDate: selectionContext.randomSeedDate
  }

  if (!input.bypassEnabled && !config.enabled) {
    return {
      status: 'SKIPPED_DISABLED',
      dateStamp,
      dateIso,
      usedTopicFallback: false,
      ...runMeta,
      reason: 'automation disabled'
    }
  }

  const existingPaths = await listContentMarkdownPaths()
  const slugSet = new Set(existingPaths.map(extractSlug).filter(Boolean) as string[])

  if (Array.from(slugSet).some(slug => slug.startsWith(`${AUTO_POST_PREFIX}${dateStamp}-`))) {
    return {
      status: 'SKIPPED_ALREADY_PUBLISHED_TODAY',
      dateStamp,
      dateIso,
      usedTopicFallback: false,
      ...runMeta,
      reason: `post already exists for ${dateStamp}`
    }
  }

  let preview: GithubHotCandidatesPreviewResult
  try {
    preview = await previewGithubHotCandidates({
      overrideConfig: config
    })
  } catch (error) {
    return {
      status: 'SKIPPED_FETCH_FAILED',
      dateStamp,
      dateIso,
      usedTopicFallback: false,
      ...runMeta,
      reason: error instanceof Error ? error.message : 'failed to fetch trending candidates'
    }
  }

  if (preview.candidates.length === 0) {
    return {
      status: 'SKIPPED_NO_CANDIDATE',
      dateStamp,
      dateIso,
      usedTopicFallback: preview.usedTopicFallback,
      selectionMode: preview.selectionMode,
      presetKeywords: preview.presetKeywords,
      overlayKeywords: preview.overlayKeywords,
      effectiveKeywords: preview.effectiveKeywords,
      randomSeedDate: preview.randomSeedDate,
      reason: 'no trending candidates'
    }
  }

  const usedTopicFallback = preview.usedTopicFallback
  const usedHashes = extractRepoHashes(slugSet)

  for (const candidate of preview.candidates) {
    const { slug, repoHash } = buildAutoSlug({
      dateStamp,
      fullName: candidate.fullName,
      owner: candidate.owner,
      repo: candidate.repo
    })

    if (usedHashes.has(repoHash) || slugSet.has(slug)) {
      continue
    }

    const generated = await runAiGithubHotPostGenerate({
      locale: 'zh',
      dateIso,
      topicKeywords: preview.effectiveKeywords,
      candidate
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
      requestId: input.requestId
    })

    return {
      status: 'PUBLISHED',
      dateStamp,
      dateIso,
      usedTopicFallback,
      selectionMode: preview.selectionMode,
      presetKeywords: preview.presetKeywords,
      overlayKeywords: preview.overlayKeywords,
      effectiveKeywords: preview.effectiveKeywords,
      randomSeedDate: preview.randomSeedDate,
      selectedScore: candidate.scoreInfo,
      selectedRepo: candidate,
      slug,
      changedPaths: published.changedPaths,
      publish: published.result,
      ai: {
        triggered: true,
        mode: 'publish',
        steps: [...generated.steps, ...published.ai.steps]
      }
    }
  }

  return {
    status: 'SKIPPED_NO_CANDIDATE',
    dateStamp,
    dateIso,
    usedTopicFallback,
    selectionMode: preview.selectionMode,
    presetKeywords: preview.presetKeywords,
    overlayKeywords: preview.overlayKeywords,
    effectiveKeywords: preview.effectiveKeywords,
    randomSeedDate: preview.randomSeedDate,
    reason: 'all candidates are already used'
  }
}
