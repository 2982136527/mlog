import 'server-only'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip, gunzipSync, gzipSync } from 'node:zlib'
import readingTime from 'reading-time'
import tar from 'tar-stream'
import { unstable_cache } from 'next/cache'
import { z } from 'zod'
import type { Locale } from '@/i18n/config'
import type { Post, PostFrontmatter } from '@/types/content'
import type { RepoCardsConfig } from '@/types/repo-cards'
import { postFrontmatterSchema } from '@/lib/content/schema'
import { parsePostMatter } from '@/lib/content/frontmatter'
import { PUBLIC_CONTENT_CACHE_TAG, PUBLIC_CONTENT_REVALIDATE_SECONDS } from '@/lib/content/cache'
import { parseRepoCardsConfigOrDefault } from '@/lib/blog/repo-cards-config'

const GITHUB_API_BASE = 'https://api.github.com'
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com'
const ARCHIVE_TIMEOUT_MS = 20_000
const SNAPSHOT_TIMEOUT_MS = 45_000
const MAX_SERIALIZED_SNAPSHOT_BYTES = 64 * 1024 * 1024
const MAX_SHARDS = 16
const MAX_FETCH_ATTEMPTS = 3
const FETCH_CONCURRENCY = 30
const MAX_CONTENT_FILE_SIZE = 10 * 1024 * 1024

const repoNameSchema = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/, 'invalid GitHub repository name')
const shardRegistrySchema = z.object({
  shards: z.array(z.object({ repo: repoNameSchema })).min(1).max(MAX_SHARDS)
})

type GithubContentConfig = {
  owner: string
  primaryRepo: string
  shardPrefix: string
  branch: string
  token: string
}

type TreeEntry = {
  path: string
  mode: string
  type: string
  sha: string
  size: number
  url: string
}

export type RemoteContentSnapshot = {
  posts: Post[]
  repoCardsBySlug: Record<string, RepoCardsConfig>
}

const POST_FILE_RE = /^content\/posts\/([a-z0-9-]+)\/(zh|en)\.md$/
const REPO_CARDS_FILE_RE = /^content\/posts\/([a-z0-9-]+)\/repo-cards\.json$/
const POST_SLUG_PATH_RE = /^content\/posts\/([a-z0-9-]+)\//
const SHARD_REGISTRY_PATH = 'content/system/shards.json'

function isContentFilePath(path: string): boolean {
  return POST_FILE_RE.test(path) || REPO_CARDS_FILE_RE.test(path) || path === SHARD_REGISTRY_PATH
}

function readGithubContentConfig(): GithubContentConfig | null {
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return null
  }

  const owner = (process.env.CONTENT_GITHUB_OWNER || '').trim()
  const primaryRepo = (process.env.CONTENT_GITHUB_REPO || '').trim()
  const branch = (process.env.CONTENT_GITHUB_BASE_BRANCH || 'main').trim().replace(/^refs\/heads\//, '')
  const token = (process.env.CONTENT_GITHUB_READ_TOKEN || process.env.CONTENT_GITHUB_WRITE_TOKEN || '').trim()

  if (!owner && !primaryRepo && !token) {
    return null
  }
  if (!owner || !primaryRepo || !token) {
    throw new Error('Incomplete runtime content configuration: owner, repository, and read token are all required.')
  }

  const shardPrefix = (process.env.CONTENT_GITHUB_SHARD_REPO_PREFIX || primaryRepo).trim()
  return { owner, primaryRepo, shardPrefix, branch: branch || 'main', token }
}

async function githubApiFetch<T>(url: string, config: GithubContentConfig, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'mlog-public-content'
        },
        cache: 'no-store',
        signal
      })

      if (!response.ok) {
        if (attempt + 1 < MAX_FETCH_ATTEMPTS && (response.status === 408 || response.status === 429 || response.status >= 500)) {
          await new Promise(r => setTimeout(r, 300 * 2 ** attempt))
          continue
        }
        throw new Error(`GitHub API request failed: ${url} (${response.status})`)
      }

      return response.json() as Promise<T>
    } catch (error) {
      if (error instanceof Error && 'status' in error && typeof (error as any).status === 'number') throw error
      if (attempt + 1 >= MAX_FETCH_ATTEMPTS) throw error
      await new Promise(r => setTimeout(r, 300 * 2 ** attempt))
    }
  }
  throw new Error(`Max attempts exceeded for ${url}`)
}

async function resolveCommitSha(config: GithubContentConfig, repo: string): Promise<string> {
  const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(config.branch)}`
  const data = await githubApiFetch<{ object: { sha: string; url: string } }>(url, config)
  const sha = typeof data.object?.sha === 'string' ? data.object.sha.trim() : ''
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error(`Invalid commit SHA for ${repo}`)
  }
  return sha
}

async function getRecursiveTree(config: GithubContentConfig, repo: string, commitSha: string): Promise<TreeEntry[]> {
  const commit = await githubApiFetch<{ tree: { sha: string } }>(
    `${GITHUB_API_BASE}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(repo)}/git/commits/${commitSha}`,
    config
  )

  const tree = await githubApiFetch<{ tree: TreeEntry[]; truncated: boolean }>(
    `${GITHUB_API_BASE}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(repo)}/git/trees/${commit.tree.sha}?recursive=1`,
    config
  )

  if (tree.truncated) {
    throw new Error(`Git tree truncated for ${repo}: ${tree.tree.length} entries. Use tarball fallback for large repos.`)
  }

  return tree.tree
}

async function readShardReposFromRegistry(
  config: GithubContentConfig,
  primarySha: string
): Promise<string[]> {
  const url = `${GITHUB_RAW_BASE}/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.primaryRepo)}/${primarySha}/${SHARD_REGISTRY_PATH}`
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${config.token}` },
    cache: 'no-store'
  })

  if (!response.ok) {
    return [config.primaryRepo]
  }

  const text = await response.text()
  try {
    const registry = shardRegistrySchema.parse(JSON.parse(text))
    const repos = [config.primaryRepo]
    const seen = new Set([config.primaryRepo.toLowerCase()])
    const prefix = config.shardPrefix.toLowerCase().replace(/[.*+?^{}()|[\]\\]/g, '\\$&')
    const allowedPattern = new RegExp(`^${prefix}-shard-[1-9]\\\\d*$`)

    for (const shard of registry.shards) {
      if (!allowedPattern.test(shard.repo.toLowerCase())) continue
      const key = shard.repo.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        repos.push(shard.repo)
      }
    }
    return repos
  } catch {
    return [config.primaryRepo]
  }
}

async function fetchFileContent(
  config: GithubContentConfig,
  repo: string,
  commitSha: string,
  path: string
): Promise<string> {
  const pathSegments = path.split('/').map(encodeURIComponent).join('/')
  const url = `${GITHUB_RAW_BASE}/${encodeURIComponent(config.owner)}/${encodeURIComponent(repo)}/${commitSha}/${pathSegments}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ARCHIVE_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${config.token}` },
      signal: controller.signal,
      cache: 'no-store'
    })

    if (!response.ok) {
      throw new Error(`Fetch failed: ${path} (${response.status})`)
    }

    const text = await response.text()
    if (Buffer.byteLength(text, 'utf8') > MAX_CONTENT_FILE_SIZE) {
      throw new Error(`File too large: ${path} (${text.length} bytes)`)
    }

    return text
  } finally {
    clearTimeout(timeout)
  }
}

async function batchFetchFiles(
  config: GithubContentConfig,
  repo: string,
  commitSha: string,
  entries: TreeEntry[]
): Promise<Map<string, string>> {
  const results = new Map<string, string>()

  for (let i = 0; i < entries.length; i += FETCH_CONCURRENCY) {
    const batch = entries.slice(i, i + FETCH_CONCURRENCY)
    const fetched = await Promise.allSettled(
      batch.map(entry => fetchFileContent(config, repo, commitSha, entry.path))
    )

    for (let j = 0; j < fetched.length; j++) {
      const result = fetched[j]
      const entry = batch[j]
      if (result.status === 'fulfilled') {
        results.set(entry.path, result.value)
      } else {
        console.warn('[content][fetch-warn]', entry.path, (result.reason as Error)?.message || result.reason)
      }
    }
  }

  return results
}

function parsePost(raw: string, slug: string, locale: Locale, label: string): Post {
  const parsed = parsePostMatter(raw)
  const validated = postFrontmatterSchema.safeParse(parsed.data)
  if (!validated.success) {
    const issues = validated.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')
    throw new Error(`Invalid remote frontmatter in ${label}: ${issues}`)
  }

  return {
    slug,
    locale,
    frontmatter: validated.data as PostFrontmatter,
    content: parsed.content,
    readingTime: Math.max(1, Math.ceil(readingTime(parsed.content).minutes))
  }
}

async function loadRemoteContentSnapshotTree(): Promise<RemoteContentSnapshot | null> {
  const config = readGithubContentConfig()
  if (!config) return null

  const deadline = Date.now() + SNAPSHOT_TIMEOUT_MS

  // 1. Get primary repo tree
  const primarySha = await resolveCommitSha(config, config.primaryRepo)
  if (Date.now() > deadline) throw new Error('Remote content snapshot timed out.')

  const primaryTree = await getRecursiveTree(config, config.primaryRepo, primarySha)
  if (Date.now() > deadline) throw new Error('Remote content snapshot timed out.')

  // 2. Read shard registry
  const repos = await readShardReposFromRegistry(config, primarySha)
  if (Date.now() > deadline) throw new Error('Remote content snapshot timed out.')

  // 3. Collect content files from all repos
  const slugOwners = new Map<string, string>()
  const fileInfos: Array<{ path: string; sha: string; repo: string; commitSha: string }> = []
  const seenPaths = new Set<string>()

  for (const repo of repos) {
    const sha = repo === config.primaryRepo ? primarySha : await resolveCommitSha(config, repo)
    if (Date.now() > deadline) throw new Error('Remote content snapshot timed out.')

    const tree = repo === config.primaryRepo ? primaryTree : await getRecursiveTree(config, repo, sha)
    if (Date.now() > deadline) throw new Error('Remote content snapshot timed out.')

    for (const entry of tree) {
      if (entry.type !== 'blob' || !isContentFilePath(entry.path)) continue
      if (seenPaths.has(entry.path)) continue
      seenPaths.add(entry.path)

      const slug = entry.path.match(POST_SLUG_PATH_RE)?.[1]
      if (slug) {
        const existingOwner = slugOwners.get(slug)
        if (existingOwner && existingOwner !== repo) {
          throw new Error(`Post slug is split across shards: ${slug} (${existingOwner}, ${repo})`)
        }
        slugOwners.set(slug, repo)
      }

      fileInfos.push({ path: entry.path, sha: entry.sha, repo, commitSha: sha })
    }
  }
  if (Date.now() > deadline) throw new Error('Remote content snapshot timed out.')

  // 4. Fetch file contents (group by repo for efficient fetching)
  const fileContents = new Map<string, string>()
  for (const repo of [...new Set(fileInfos.map(f => f.repo))]) {
    const repoFiles = fileInfos.filter(f => f.repo === repo)
    const repoCommitSha = repoFiles[0].commitSha
    const fetched = await batchFetchFiles(
      config, repo, repoCommitSha,
      repoFiles.map(f => ({ path: f.path, sha: f.sha, mode: '', type: 'blob', size: 0, url: '' }))
    )
    for (const [path, content] of fetched) {
      fileContents.set(path, content)
    }
    if (Date.now() > deadline) throw new Error('Remote content snapshot timed out.')
  }

  // 5. Parse into snapshot
  const posts: Post[] = []
  const repoCardsBySlug: Record<string, RepoCardsConfig> = {}

  for (const [path, content] of fileContents) {
    const postMatch = path.match(POST_FILE_RE)
    if (postMatch) {
      posts.push(parsePost(content, postMatch[1], postMatch[2] as Locale, path))
      continue
    }

    const repoCardsMatch = path.match(REPO_CARDS_FILE_RE)
    if (repoCardsMatch) {
      repoCardsBySlug[repoCardsMatch[1]] = parseRepoCardsConfigOrDefault(content)
    }
  }

  return { posts, repoCardsBySlug }
}

const getCompressedRemoteContentSnapshot = unstable_cache(
  async (): Promise<string | null> => {
    const snapshot = await loadRemoteContentSnapshotTree()
    if (!snapshot) return null

    const serialized = JSON.stringify(snapshot)
    if (Buffer.byteLength(serialized, 'utf8') > MAX_SERIALIZED_SNAPSHOT_BYTES) {
      throw new Error('Serialized remote content snapshot exceeds its configured size limit.')
    }
    return gzipSync(serialized).toString('base64')
  },
  ['public-content-snapshot-v3-gzip'],
  {
    revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS,
    tags: [PUBLIC_CONTENT_CACHE_TAG]
  }
)

export async function getRemoteContentSnapshot(): Promise<RemoteContentSnapshot | null> {
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return null
  }

  const compressed = await getCompressedRemoteContentSnapshot()
  if (!compressed) return null

  const serialized = gunzipSync(Buffer.from(compressed, 'base64'), {
    maxOutputLength: MAX_SERIALIZED_SNAPSHOT_BYTES
  }).toString('utf8')
  return JSON.parse(serialized) as RemoteContentSnapshot
}

export async function getRemoteContentSnapshotUncached(): Promise<RemoteContentSnapshot | null> {
  if (process.env.NEXT_PHASE === 'phase-production-build') return null
  return loadRemoteContentSnapshotTree()
}
