import 'server-only'
import { unstable_cache } from 'next/cache'
import { isLocale, type Locale } from '@/i18n/config'
import { getLocalizedPost } from '@/lib/content'
import { fetchGithubRepoLiveSnapshot, GithubRepoLiveSnapshotError } from '@/lib/automation/github-hot/evidence'
import type { LiveCardErrorCode, LiveCardResponse } from '@/types/analytics'
import { extractGithubRepoFromMarkdown, getRepoCardsConfigFromLocal, parseGithubRepoUrl } from '@/lib/blog/repo-cards-config'
import { isHotDailyTags } from '@/lib/blog/static-snapshot'

export const LIVE_CARD_CACHE_TTL_SECONDS = 600

type RepoIdentity = {
  owner: string
  repo: string
  fullName: string
  normalizedUrl: string
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

function getRepoIdentityForLiveCard(input: {
  slug: string
  isHotDaily: boolean
  markdown: string
}): RepoIdentity {
  if (input.isHotDaily) {
    const parsed = extractGithubRepoFromMarkdown(input.markdown)
    if (!parsed) {
      throw new LiveCardHttpError(422, 'REPO_NOT_FOUND_IN_POST', 'Repository URL was not found in this post.')
    }

    return {
      owner: parsed.owner,
      repo: parsed.repo,
      fullName: parsed.fullName,
      normalizedUrl: parsed.normalizedUrl
    }
  }

  const repoCards = getRepoCardsConfigFromLocal(input.slug)
  if (!repoCards.enabled || !repoCards.repoUrl) {
    throw new LiveCardHttpError(404, 'NOT_LIVE_CARD_POST', 'Live cards are not enabled for this post.')
  }

  const parsed = parseGithubRepoUrl(repoCards.repoUrl)
  return {
    owner: parsed.owner,
    repo: parsed.repo,
    fullName: parsed.fullName,
    normalizedUrl: parsed.normalizedUrl
  }
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

  const repo = getRepoIdentityForLiveCard({
    slug: post.slug,
    isHotDaily: isHotDailyTags(post.frontmatter.tags),
    markdown: post.content
  })

  let liveSnapshot: Awaited<ReturnType<typeof getCachedRepoSnapshot>>
  try {
    liveSnapshot = await getCachedRepoSnapshot(repo.owner, repo.repo)
  } catch (error) {
    const upstream = error instanceof GithubRepoLiveSnapshotError
      ? {
          primaryStatus: error.primaryStatus,
          fallbackAttempted: error.fallbackAttempted,
          fallbackStatus: error.fallbackStatus
        }
      : {
          primaryStatus: null,
          fallbackAttempted: false,
          fallbackStatus: null
        }

    console.error('[blog][live-card][github-upstream]', {
      locale,
      slug,
      repo: `${repo.owner}/${repo.repo}`,
      ...upstream,
      error: error instanceof Error ? error.message : error
    })
    throw new LiveCardHttpError(503, 'GITHUB_UPSTREAM_FAILED', 'GitHub upstream request failed.')
  }

  return {
    enabled: true,
    locale,
    slug,
    repo: {
      fullName: liveSnapshot.fullName || repo.fullName,
      url: liveSnapshot.url || repo.normalizedUrl,
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
