import 'server-only'
import type { PostStaticSnapshot, RepoCardsConfig } from '@/types/repo-cards'
import { extractGithubRepoFromMarkdown } from '@/lib/blog/repo-cards-config'

const HOT_DAILY_REQUIRED_TAGS = ['ai-auto', 'github-hot'] as const
const HOT_DAILY_SECTION_TITLES = ['已确认事实（数据卡）', '已确认事实(数据卡)', 'confirmedfacts(datacard)', 'confirmedfacts', 'verifiedfacts']
const HOT_DAILY_SOURCE_SECTION_TITLES = ['证据来源', 'evidence sources', 'evidence source', 'sources']

function normalizeHeading(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[：:（）()\[\]【】]/g, '')
    .trim()
}

function extractH2Section(markdown: string, titleCandidates: string[]): string {
  const lines = markdown.split('\n')
  const normalizedCandidates = new Set(titleCandidates.map(normalizeHeading))
  const startIndex = lines.findIndex(line => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('## ')) {
      return false
    }
    return normalizedCandidates.has(normalizeHeading(trimmed.slice(3)))
  })

  if (startIndex < 0) {
    return ''
  }

  let endIndex = lines.length
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (lines[index].trim().startsWith('## ')) {
      endIndex = index
      break
    }
  }

  return lines.slice(startIndex + 1, endIndex).join('\n').trim()
}

function findH2SectionRange(markdown: string, titleCandidates: string[]): { startLine: number; endLine: number } | null {
  const lines = markdown.split('\n')
  const normalizedCandidates = new Set(titleCandidates.map(normalizeHeading))
  const startLine = lines.findIndex(line => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('## ')) {
      return false
    }
    return normalizedCandidates.has(normalizeHeading(trimmed.slice(3)))
  })

  if (startLine < 0) {
    return null
  }

  let endLine = lines.length
  for (let index = startLine + 1; index < lines.length; index += 1) {
    if (lines[index].trim().startsWith('## ')) {
      endLine = index
      break
    }
  }

  return { startLine, endLine }
}

function parseMetric(input: string, keys: string[]): number | null {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`${escaped}[^\\d]{0,16}([\\d,]+)`, 'i')
    const matched = input.match(regex)
    if (!matched?.[1]) {
      continue
    }
    const value = Number(matched[1].replace(/,/g, ''))
    if (Number.isFinite(value)) {
      return value
    }
  }

  return null
}

function parseDateMaybeIso(input: string): string | null {
  const matched = input.match(/(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?/)
  if (!matched) {
    return null
  }

  const value = matched[2] ? `${matched[1]}T${matched[2]}` : `${matched[1]}T00:00:00`
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function parseEvidenceFetchTime(input: string): string | null {
  const matched = input.match(/(?:获取时间|抓取时间|fetched\s*at)[^0-9]*(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?/i)
  if (!matched) {
    return null
  }

  const value = matched[2] ? `${matched[1]}T${matched[2]}` : `${matched[1]}T00:00:00`
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function toIsoOrNull(value: string | null | undefined): string | null {
  const text = (value || '').trim()
  if (!text) {
    return null
  }
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function isHotDailyTags(tags: string[]): boolean {
  const normalized = new Set(tags.map(tag => tag.trim().toLowerCase()))
  return HOT_DAILY_REQUIRED_TAGS.every(tag => normalized.has(tag))
}

export function toPostStaticSnapshotFromRepoCards(config: RepoCardsConfig): PostStaticSnapshot | null {
  if (!config.enabled || !config.staticSnapshot) {
    return null
  }

  return {
    repoUrl: config.repoUrl || null,
    repoFullName: config.repoFullName || null,
    stars: config.staticSnapshot.stars,
    forks: config.staticSnapshot.forks,
    openIssues: config.staticSnapshot.openIssues,
    snapshotAt: toIsoOrNull(config.staticSnapshot.snapshotAt),
    language: config.staticSnapshot.language || null,
    license: config.staticSnapshot.license || null,
    pushedAt: toIsoOrNull(config.staticSnapshot.pushedAt),
    updatedAt: toIsoOrNull(config.staticSnapshot.updatedAt)
  }
}

export function extractHotDailyStaticSnapshot(markdown: string, fallbackDate?: string): PostStaticSnapshot | null {
  const section = extractH2Section(markdown, HOT_DAILY_SECTION_TITLES)
  const source = section || markdown
  const evidenceSourceSection = extractH2Section(markdown, HOT_DAILY_SOURCE_SECTION_TITLES)
  const repo = extractGithubRepoFromMarkdown(markdown)
  const stars = parseMetric(source, ['Stars', 'Star', '⭐', '星标'])
  const forks = parseMetric(source, ['Forks', 'Fork', '分叉'])
  const openIssues = parseMetric(source, ['Open Issues', 'Issues', 'Issue', '未关闭 Issue', '问题数'])
  const snapshotAt = parseEvidenceFetchTime(evidenceSourceSection) || toIsoOrNull(fallbackDate) || parseDateMaybeIso(source)

  if (!repo && stars === null && forks === null && openIssues === null && !snapshotAt) {
    return null
  }

  return {
    repoUrl: repo?.normalizedUrl || null,
    repoFullName: repo?.fullName || null,
    stars,
    forks,
    openIssues,
    snapshotAt,
    language: null,
    license: null,
    pushedAt: null,
    updatedAt: null
  }
}

export function stripConfirmedFactsSection(markdown: string): { markdown: string; removed: boolean } {
  const range = findH2SectionRange(markdown, HOT_DAILY_SECTION_TITLES)
  if (!range) {
    return {
      markdown,
      removed: false
    }
  }

  const lines = markdown.split('\n')
  const stripped = lines.slice(0, range.startLine).concat(lines.slice(range.endLine)).join('\n').replace(/\n{3,}/g, '\n\n').trim()

  return {
    markdown: stripped ? `${stripped}\n` : '',
    removed: true
  }
}
