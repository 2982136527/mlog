import type { GithubHotRepoCandidate, GithubRepoEvidence } from '@/types/automation'

type GitHubRepoApiResponse = {
  full_name?: string
  html_url?: string
  description?: string | null
  language?: string | null
  stargazers_count?: number
  forks_count?: number
  open_issues_count?: number
  license?: {
    spdx_id?: string | null
    name?: string | null
  } | null
  created_at?: string | null
  pushed_at?: string | null
  default_branch?: string | null
}

type GitHubReleaseApiResponse = {
  tag_name?: string | null
  published_at?: string | null
}

type GitHubReadmeApiResponse = {
  content?: string
  encoding?: string
  download_url?: string
  html_url?: string
}

type JsonFetchResult<T> = {
  ok: boolean
  status: number
  data: T | null
}

function buildGitHubHeaders(): HeadersInit {
  const token = (process.env.CONTENT_GITHUB_READ_TOKEN || process.env.CONTENT_GITHUB_WRITE_TOKEN || '').trim()
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'mlog-github-hot-bot',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

function withTextLimit(value: string, maxLength = 220): string {
  const compact = value.replace(/\s+/g, ' ').trim()
  if (compact.length <= maxLength) {
    return compact
  }
  return `${compact.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function decodeBase64Utf8(input: string): string {
  try {
    return Buffer.from(input.replace(/\n/g, ''), 'base64').toString('utf8')
  } catch {
    return ''
  }
}

function extractReadmeHighlights(markdown: string): string[] {
  const lines = markdown.split('\n').map(line => line.trim())
  const highlights: string[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    if (!line) {
      continue
    }

    if (/^!\[.*\]\(.*\)$/.test(line) || /^<[^>]+>/.test(line) || /^---+$/.test(line)) {
      continue
    }

    if (/^\[!\[/.test(line) || /^>\s/.test(line)) {
      continue
    }

    const heading = line.match(/^#{1,3}\s+(.+)$/)
    const bullet = line.match(/^[-*]\s+(.+)$/)
    const ordered = line.match(/^\d+\.\s+(.+)$/)
    const paragraph = !heading && !bullet && !ordered ? line : null
    const raw = heading?.[1] || bullet?.[1] || ordered?.[1] || paragraph || ''
    const normalized = withTextLimit(raw, 180)

    if (!normalized) {
      continue
    }

    if (seen.has(normalized.toLowerCase())) {
      continue
    }

    seen.add(normalized.toLowerCase())
    highlights.push(normalized)

    if (highlights.length >= 10) {
      break
    }
  }

  return highlights.slice(0, 10)
}

async function fetchJson<T>(url: string): Promise<JsonFetchResult<T>> {
  try {
    const response = await fetch(url, {
      headers: buildGitHubHeaders(),
      cache: 'no-store'
    })
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        data: null
      }
    }
    return {
      ok: true,
      status: response.status,
      data: (await response.json()) as T
    }
  } catch {
    return {
      ok: false,
      status: 0,
      data: null
    }
  }
}

async function fetchReadme(owner: string, repo: string): Promise<{ highlights: string[]; sourceUrl: string | null }> {
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`
  const response = await fetchJson<GitHubReadmeApiResponse>(endpoint)
  const payload = response.data
  if (!payload) {
    return {
      highlights: [],
      sourceUrl: `https://github.com/${owner}/${repo}#readme`
    }
  }

  const sourceUrl = payload.html_url || payload.download_url || `https://github.com/${owner}/${repo}#readme`
  const decoded = payload.content && payload.encoding === 'base64' ? decodeBase64Utf8(payload.content) : ''
  return {
    highlights: decoded ? extractReadmeHighlights(decoded) : [],
    sourceUrl
  }
}

function normalizeIsoOrNull(value: string | null | undefined): string | null {
  const trimmed = (value || '').trim()
  if (!trimmed) {
    return null
  }
  const date = new Date(trimmed)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export async function collectGithubRepoEvidence(candidate: GithubHotRepoCandidate): Promise<GithubRepoEvidence> {
  const fetchedAt = new Date().toISOString()
  const repoEndpoint = `https://api.github.com/repos/${encodeURIComponent(candidate.owner)}/${encodeURIComponent(candidate.repo)}`
  const releaseEndpoint = `https://api.github.com/repos/${encodeURIComponent(candidate.owner)}/${encodeURIComponent(candidate.repo)}/releases/latest`

  const [repoResult, releaseResult, readmeResult] = await Promise.all([
    fetchJson<GitHubRepoApiResponse>(repoEndpoint),
    fetchJson<GitHubReleaseApiResponse>(releaseEndpoint),
    fetchReadme(candidate.owner, candidate.repo)
  ])

  const repo = repoResult.data
  const release = releaseResult.ok ? releaseResult.data : null

  const sourceUrls = Array.from(
    new Set(
      [repoEndpoint, releaseEndpoint, readmeResult.sourceUrl, candidate.url]
        .map(item => (item || '').trim())
        .filter(Boolean)
    )
  )

  return {
    fullName: repo?.full_name || candidate.fullName,
    url: repo?.html_url || candidate.url,
    description: (repo?.description || candidate.description || '').trim(),
    language: (repo?.language || candidate.language || '').trim(),
    stars: Number.isFinite(repo?.stargazers_count) ? Number(repo?.stargazers_count) : candidate.stars,
    forks: Number.isFinite(repo?.forks_count) ? Number(repo?.forks_count) : candidate.forks,
    openIssues: Number.isFinite(repo?.open_issues_count) ? Number(repo?.open_issues_count) : 0,
    license: (repo?.license?.spdx_id || repo?.license?.name || '').trim() || null,
    createdAt: normalizeIsoOrNull(repo?.created_at ?? null),
    pushedAt: normalizeIsoOrNull(repo?.pushed_at ?? null),
    defaultBranch: (repo?.default_branch || '').trim() || null,
    latestReleaseTag: (release?.tag_name || '').trim() || null,
    latestReleaseAt: normalizeIsoOrNull(release?.published_at ?? null),
    readmeHighlights: readmeResult.highlights.slice(0, 10),
    sourceUrls,
    fetchedAt
  }
}
