import type { GithubHotRepoCandidate } from '@/types/automation'

const TRENDING_URL = 'https://github.com/trending?since=daily'
const REPO_LINK_RE = /<h2[^>]*>\s*<a[^>]*href="\/([^\/"\s]+)\/([^\/"\s]+)"/gim
const GITHUB_API_BASE = 'https://api.github.com'

type GitHubRepoResponse = {
  full_name?: string
  html_url?: string
  description?: string | null
  language?: string | null
  topics?: string[]
  stargazers_count?: number
  forks_count?: number
  updated_at?: string
}

type TrendingRepoName = {
  rank: number
  owner: string
  repo: string
}

function cleanRepoPart(value: string): string {
  return value.trim().replace(/\s+/g, '')
}

function parseTrendingRepoNames(html: string, limit: number): TrendingRepoName[] {
  const found: TrendingRepoName[] = []
  const seen = new Set<string>()

  for (const match of html.matchAll(REPO_LINK_RE)) {
    const owner = cleanRepoPart(match[1] || '')
    const repo = cleanRepoPart(match[2] || '')
    if (!owner || !repo) {
      continue
    }

    const fullName = `${owner}/${repo}`.toLowerCase()
    if (seen.has(fullName)) {
      continue
    }

    seen.add(fullName)
    found.push({
      rank: found.length + 1,
      owner,
      repo
    })

    if (found.length >= limit) {
      break
    }
  }

  return found
}

function buildGitHubHeaders(): HeadersInit {
  const token = (process.env.CONTENT_GITHUB_READ_TOKEN || process.env.CONTENT_GITHUB_WRITE_TOKEN || process.env.GITHUB_WRITE_TOKEN || '').trim()
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'mlog-github-hot-bot',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

async function fetchRepoDetails(owner: string, repo: string): Promise<GitHubRepoResponse | null> {
  const response = await fetch(`${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
    headers: buildGitHubHeaders(),
    cache: 'no-store'
  })

  if (!response.ok) {
    return null
  }

  return (await response.json()) as GitHubRepoResponse
}

function toCandidate(base: TrendingRepoName, detail: GitHubRepoResponse | null): GithubHotRepoCandidate {
  const fallbackFullName = `${base.owner}/${base.repo}`
  return {
    rank: base.rank,
    owner: base.owner,
    repo: base.repo,
    fullName: detail?.full_name || fallbackFullName,
    url: detail?.html_url || `https://github.com/${fallbackFullName}`,
    description: (detail?.description || '').trim(),
    language: (detail?.language || '').trim(),
    topics: Array.isArray(detail?.topics) ? detail!.topics!.map(item => item.trim()).filter(Boolean) : [],
    stars: Number.isFinite(detail?.stargazers_count) ? Number(detail!.stargazers_count) : 0,
    forks: Number.isFinite(detail?.forks_count) ? Number(detail!.forks_count) : 0,
    updatedAt: detail?.updated_at || ''
  }
}

export async function fetchGithubTrendingCandidates(limit = 30): Promise<GithubHotRepoCandidate[]> {
  const response = await fetch(TRENDING_URL, {
    headers: {
      'User-Agent': 'mlog-github-hot-bot'
    },
    cache: 'no-store'
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch GitHub Trending: ${response.status}`)
  }

  const html = await response.text()
  const baseRepos = parseTrendingRepoNames(html, limit)

  const details = await Promise.all(baseRepos.map(item => fetchRepoDetails(item.owner, item.repo)))
  return baseRepos.map((item, index) => toCandidate(item, details[index] || null))
}
