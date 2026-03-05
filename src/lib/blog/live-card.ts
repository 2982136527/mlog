import 'server-only'
import { unstable_cache } from 'next/cache'
import { isLocale, type Locale } from '@/i18n/config'
import { getLocalizedPost } from '@/lib/content'
import { fetchGithubRepoLiveSnapshot } from '@/lib/automation/github-hot/evidence'
import type { LiveCardErrorCode, LiveCardResponse } from '@/types/analytics'

const HOT_DAILY_REQUIRED_TAGS = ['ai-auto', 'github-hot'] as const
const GITHUB_REPO_URL_RE = /https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:[/?#][^\s<]*)?/gi

export const LIVE_CARD_CACHE_TTL_SECONDS = 600

type RepoIdentity = {
  owner: string
  repo: string
}

export class LiveCardHttpError extends Error {
  status: number
  code: LiveCardErrorCode

  constructor(status: number, code: LiveCardErrorCode, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

function normalizeRepoSegment(value: string): string {
  return value
    .trim()
    .replace(/\.git$/i, '')
    .replace(/[.,;:!?]+$/, '')
}

function extractRepoIdentity(markdown: string): RepoIdentity | null {
  for (const match of markdown.matchAll(GITHUB_REPO_URL_RE)) {
    const owner = normalizeRepoSegment(match[1] || '')
    const repo = normalizeRepoSegment(match[2] || '')
    if (owner && repo) {
      return { owner, repo }
    }
  }

  return null
}

function isHotDailyPostTags(tags: string[]): boolean {
  const normalized = new Set(tags.map(tag => tag.trim().toLowerCase()))
  return HOT_DAILY_REQUIRED_TAGS.every(tag => normalized.has(tag))
}

const getCachedRepoSnapshot = unstable_cache(
  async (owner: string, repo: string) => {
    return fetchGithubRepoLiveSnapshot(owner, repo)
  },
  ['blog-live-card'],
  { revalidate: LIVE_CARD_CACHE_TTL_SECONDS }
)

export async function getLiveCardForPost(input: { locale: string; slug: string }): Promise<LiveCardResponse> {
  const localeRaw = input.locale.trim()
  const slug = input.slug.trim()

  if (!isLocale(localeRaw) || !slug) {
    throw new LiveCardHttpError(404, 'POST_NOT_FOUND', 'Post not found.')
  }

  const locale: Locale = localeRaw
  const post = getLocalizedPost(locale, slug)
  if (!post) {
    throw new LiveCardHttpError(404, 'POST_NOT_FOUND', 'Post not found.')
  }

  if (!isHotDailyPostTags(post.frontmatter.tags)) {
    throw new LiveCardHttpError(404, 'NOT_HOT_DAILY_POST', 'Post is not a GitHub hot daily article.')
  }

  const repo = extractRepoIdentity(post.content)
  if (!repo) {
    throw new LiveCardHttpError(422, 'REPO_NOT_FOUND_IN_POST', 'Repository URL was not found in this post.')
  }

  let liveSnapshot: Awaited<ReturnType<typeof getCachedRepoSnapshot>>
  try {
    liveSnapshot = await getCachedRepoSnapshot(repo.owner, repo.repo)
  } catch (error) {
    console.error('[blog][live-card][github-upstream]', {
      locale,
      slug,
      repo: `${repo.owner}/${repo.repo}`,
      error
    })
    throw new LiveCardHttpError(503, 'GITHUB_UPSTREAM_FAILED', 'GitHub upstream request failed.')
  }

  return {
    enabled: true,
    locale,
    slug,
    repo: {
      fullName: liveSnapshot.fullName,
      url: liveSnapshot.url,
      language: liveSnapshot.language,
      license: liveSnapshot.license
    },
    live: {
      stars: liveSnapshot.stars,
      forks: liveSnapshot.forks,
      openIssues: liveSnapshot.openIssues,
      pushedAt: liveSnapshot.pushedAt,
      updatedAt: liveSnapshot.updatedAt
    },
    fetchedAt: liveSnapshot.fetchedAt,
    cacheTtlSeconds: LIVE_CARD_CACHE_TTL_SECONDS
  }
}
