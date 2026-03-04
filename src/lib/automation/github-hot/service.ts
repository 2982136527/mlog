import { createHash } from 'node:crypto'
import type { AdminPostPayload } from '@/types/admin'
import type { GithubHotDailyConfig, GithubHotDailyRunResult, GithubHotRepoCandidate } from '@/types/automation'
import { listContentMarkdownPaths } from '@/lib/admin/github-client'
import { publishPostChanges } from '@/lib/admin/publish-service'
import { loadGithubHotDailyConfig } from '@/lib/automation/github-hot/config-store'
import { fetchGithubTrendingCandidates } from '@/lib/automation/github-hot/trending'
import { runAiGithubHotPostGenerate } from '@/lib/ai/runner'

const AUTO_POST_PREFIX = 'gh-hot-'

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

function applyTopicFilter(candidates: GithubHotRepoCandidate[], config: GithubHotDailyConfig): { selectedPool: GithubHotRepoCandidate[]; usedTopicFallback: boolean } {
  const keywords = config.topicKeywords.map(item => item.trim().toLowerCase()).filter(Boolean)
  if (keywords.length === 0) {
    return {
      selectedPool: candidates,
      usedTopicFallback: false
    }
  }

  const matched = candidates.filter(candidate => {
    const searchSpace = [candidate.fullName, candidate.repo, candidate.description, candidate.language, ...candidate.topics].join(' ').toLowerCase()
    return keywords.some(keyword => searchSpace.includes(keyword))
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

  if (!input.bypassEnabled && !config.enabled) {
    return {
      status: 'SKIPPED_DISABLED',
      dateStamp,
      dateIso,
      usedTopicFallback: false,
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
      reason: `post already exists for ${dateStamp}`
    }
  }

  let candidates: GithubHotRepoCandidate[]
  try {
    candidates = await fetchGithubTrendingCandidates(30)
  } catch (error) {
    return {
      status: 'SKIPPED_FETCH_FAILED',
      dateStamp,
      dateIso,
      usedTopicFallback: false,
      reason: error instanceof Error ? error.message : 'failed to fetch trending candidates'
    }
  }

  if (candidates.length === 0) {
    return {
      status: 'SKIPPED_NO_CANDIDATE',
      dateStamp,
      dateIso,
      usedTopicFallback: false,
      reason: 'no trending candidates'
    }
  }

  const { selectedPool, usedTopicFallback } = applyTopicFilter(candidates, config)
  const usedHashes = extractRepoHashes(slugSet)

  for (const candidate of selectedPool) {
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
      topicKeywords: config.topicKeywords,
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
    reason: 'all candidates are already used'
  }
}

