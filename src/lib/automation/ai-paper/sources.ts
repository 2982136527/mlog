import type { AiPaperCandidate } from '@/types/automation'

const ARXIV_QUERY_ENDPOINT = 'https://export.arxiv.org/api/query'
const PWC_SEARCH_ENDPOINT = 'https://paperswithcode.com/search'
const DEFAULT_TIMEOUT_MS = 12_000

type FetchTextResult = {
  ok: boolean
  status: number
  text: string
}

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function compactText(input: string): string {
  return decodeXmlEntities(input.replace(/\s+/g, ' ').trim())
}

function stripXmlTags(input: string): string {
  return compactText(input.replace(/<[^>]+>/g, ' '))
}

function extractTagValue(input: string, tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matched = input.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i'))
  return matched?.[1] ? compactText(matched[1]) : ''
}

function extractRepeatedTagValues(input: string, tag: string): string[] {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return Array.from(input.matchAll(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'gi')))
    .map(match => compactText(match[1] || ''))
    .filter(Boolean)
}

function normalizeIso(input: string): string {
  const parsed = new Date(input)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }
  return parsed.toISOString()
}

function extractArxivId(rawId: string): string {
  const normalized = rawId.trim()
  const fromAbs = normalized.match(/\/abs\/([^?\s#]+)/i)?.[1] || normalized
  return fromAbs.replace(/v\d+$/i, '')
}

function sanitizePaperUrl(rawId: string): string {
  const arxivId = extractArxivId(rawId)
  return arxivId ? `https://arxiv.org/abs/${arxivId}` : rawId.trim()
}

function extractCategories(entryXml: string): string[] {
  return Array.from(entryXml.matchAll(/<category[^>]*term="([^"]+)"[^>]*\/?>/gi))
    .map(match => compactText(match[1] || ''))
    .filter(Boolean)
}

function parseArxivEntries(xml: string, limit: number): AiPaperCandidate[] {
  const entryBlocks = Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)).map(match => match[1] || '')
  const candidates: AiPaperCandidate[] = []

  for (const block of entryBlocks.slice(0, limit)) {
    const idRaw = extractTagValue(block, 'id')
    const arxivId = extractArxivId(idRaw)
    if (!arxivId) {
      continue
    }

    const title = stripXmlTags(extractTagValue(block, 'title'))
    const summary = stripXmlTags(extractTagValue(block, 'summary'))
    const publishedAt = normalizeIso(extractTagValue(block, 'published'))
    const updatedAt = normalizeIso(extractTagValue(block, 'updated'))
    const authors = extractRepeatedTagValues(block, 'name')
    const categories = extractCategories(block)
    const paperUrl = sanitizePaperUrl(idRaw)

    candidates.push({
      rank: candidates.length + 1,
      arxivId,
      title,
      summary,
      authors,
      categories,
      publishedAt,
      updatedAt,
      paperUrl,
      pwcUrl: null,
      codeUrl: null,
      hasCode: false,
      signalsScore: 0
    })
  }

  return candidates
}

async function fetchText(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<FetchTextResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'mlog-ai-paper-bot'
      },
      signal: controller.signal
    })

    return {
      ok: response.ok,
      status: response.status,
      text: await response.text()
    }
  } catch {
    return {
      ok: false,
      status: 0,
      text: ''
    }
  } finally {
    clearTimeout(timer)
  }
}

function findFirstPaperPath(html: string): string | null {
  const matched = html.match(/href="(\/paper\/[^"#?]+)"/i)
  return matched?.[1] || null
}

function findFirstGithubUrl(html: string): string | null {
  const matched = html.match(/href="(https:\/\/github\.com\/[^"<\s]+)"/i)
  return matched?.[1] || null
}

async function fetchPwcSignals(input: { arxivId: string }): Promise<{ pwcUrl: string | null; codeUrl: string | null; hasCode: boolean }> {
  const searchParams = new URLSearchParams({
    q: input.arxivId
  })

  const searchResult = await fetchText(`${PWC_SEARCH_ENDPOINT}?${searchParams.toString()}`)
  if (!searchResult.ok || !searchResult.text) {
    return {
      pwcUrl: null,
      codeUrl: null,
      hasCode: false
    }
  }

  const paperPath = findFirstPaperPath(searchResult.text)
  if (!paperPath) {
    return {
      pwcUrl: null,
      codeUrl: null,
      hasCode: false
    }
  }

  const pwcUrl = `https://paperswithcode.com${paperPath}`
  let codeUrl = findFirstGithubUrl(searchResult.text)
  if (!codeUrl) {
    const detailResult = await fetchText(pwcUrl)
    if (detailResult.ok && detailResult.text) {
      codeUrl = findFirstGithubUrl(detailResult.text)
    }
  }

  return {
    pwcUrl,
    codeUrl: codeUrl || null,
    hasCode: Boolean(codeUrl)
  }
}

function computeSignalsScore(candidate: AiPaperCandidate, includeCodeFirst: boolean): number {
  const freshness = Math.max(0, 50 - candidate.rank)
  const summarySignal = candidate.summary.length >= 120 ? 3 : 1
  const aiCategorySignal = candidate.categories.some(category => ['cs.AI', 'cs.LG', 'cs.CL', 'stat.ML'].includes(category)) ? 5 : 0
  const pwcSignal = candidate.pwcUrl ? 12 : 0
  const codeSignal = candidate.hasCode ? 20 : includeCodeFirst ? -8 : 0
  const total = freshness + summarySignal + aiCategorySignal + pwcSignal + codeSignal
  return Number(total.toFixed(2))
}

function sortCandidates(candidates: AiPaperCandidate[], includeCodeFirst: boolean): AiPaperCandidate[] {
  return [...candidates]
    .sort((a, b) => {
      if (includeCodeFirst && a.hasCode !== b.hasCode) {
        return a.hasCode ? -1 : 1
      }
      return b.signalsScore - a.signalsScore || a.rank - b.rank
    })
    .map((candidate, index) => ({
      ...candidate,
      rank: index + 1
    }))
}

export async function fetchAiPaperCandidates(input: {
  arxivCategories: string[]
  maxCandidates: number
  includeCodeFirst: boolean
}): Promise<AiPaperCandidate[]> {
  const categories = input.arxivCategories.length > 0 ? input.arxivCategories : ['cs.AI', 'cs.LG', 'cs.CL', 'stat.ML']
  const searchQuery = categories.map(category => `cat:${category}`).join(' OR ')
  const params = new URLSearchParams({
    search_query: searchQuery,
    sortBy: 'submittedDate',
    sortOrder: 'descending',
    max_results: String(Math.max(5, Math.min(50, input.maxCandidates)))
  })

  const arxivResult = await fetchText(`${ARXIV_QUERY_ENDPOINT}?${params.toString()}`)
  if (!arxivResult.ok || !arxivResult.text) {
    throw new Error(`Failed to fetch arXiv feed (${arxivResult.status})`)
  }

  const baseCandidates = parseArxivEntries(arxivResult.text, Math.max(5, Math.min(50, input.maxCandidates)))
  if (baseCandidates.length === 0) {
    return []
  }

  const enriched = await Promise.all(
    baseCandidates.map(async candidate => {
      const pwcSignals = await fetchPwcSignals({
        arxivId: candidate.arxivId
      })

      const next: AiPaperCandidate = {
        ...candidate,
        pwcUrl: pwcSignals.pwcUrl,
        codeUrl: pwcSignals.codeUrl,
        hasCode: pwcSignals.hasCode
      }

      return {
        ...next,
        signalsScore: computeSignalsScore(next, input.includeCodeFirst)
      }
    })
  )

  return sortCandidates(enriched, input.includeCodeFirst)
}
