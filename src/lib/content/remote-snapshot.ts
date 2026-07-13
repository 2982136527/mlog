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
const ARCHIVE_TIMEOUT_MS = 20_000
const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024
const MAX_EXPANDED_ARCHIVE_BYTES = 128 * 1024 * 1024
const MAX_TOTAL_ARCHIVE_BYTES = 50 * 1024 * 1024
const MAX_TOTAL_EXPANDED_ARCHIVE_BYTES = 256 * 1024 * 1024
const MAX_ENTRY_BYTES = 8 * 1024 * 1024
const MAX_SNAPSHOT_CONTENT_BYTES = 8 * 1024 * 1024
const MAX_ARCHIVE_ENTRIES = 20_000
const MAX_TOTAL_ARCHIVE_ENTRIES = 40_000
const MAX_SNAPSHOT_FILES = 10_000
const MAX_SHARDS = 16
const MAX_FETCH_ATTEMPTS = 3
const MAX_SERIALIZED_SNAPSHOT_BYTES = 64 * 1024 * 1024
const SNAPSHOT_TIMEOUT_MS = 45_000
const POST_FILE_RE = /^content\/posts\/([a-z0-9-]+)\/(zh|en)\.md$/
const REPO_CARDS_FILE_RE = /^content\/posts\/([a-z0-9-]+)\/repo-cards\.json$/
const SHARD_REGISTRY_PATH = 'content/system/shards.json'
const POST_SLUG_PATH_RE = /^content\/posts\/([a-z0-9-]+)\//

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

type GithubRefResponse = {
  object?: {
    sha?: unknown
  }
}

type ArchiveBudget = {
  compressedBytes: number
  expandedBytes: number
  entries: number
  deadline: number
}

export type RemoteContentSnapshot = {
  posts: Post[]
  repoCardsBySlug: Record<string, RepoCardsConfig>
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

class ArchiveValidationError extends Error {}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers.get('retry-after'))
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, 5_000)
  }
  return 300 * 2 ** attempt
}

function shouldRetryStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

function encodeGithubPathSegments(value: string): string {
  return value.split('/').map(segment => encodeURIComponent(segment)).join('/')
}

async function wait(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

async function readResponseBuffer(response: Response, repo: string, budget: ArchiveBudget): Promise<Buffer> {
  if (!response.body) {
    throw new ArchiveValidationError(`GitHub archive response has no body for ${repo}.`)
  }

  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      const chunk = Buffer.from(value)
      totalBytes += chunk.length
      budget.compressedBytes += chunk.length
      if (totalBytes > MAX_ARCHIVE_BYTES || budget.compressedBytes > MAX_TOTAL_ARCHIVE_BYTES || Date.now() > budget.deadline) {
        await reader.cancel().catch(() => {})
        throw new ArchiveValidationError(`GitHub archive download exceeded its resource budget at ${repo}.`)
      }
      chunks.push(chunk)
    }
  } finally {
    reader.releaseLock()
  }

  return Buffer.concat(chunks, totalBytes)
}

async function resolveRepoHead(config: GithubContentConfig, repo: string, budget: ArchiveBudget): Promise<string> {
  const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeGithubPathSegments(config.branch)}`
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt += 1) {
    const remainingMs = budget.deadline - Date.now()
    if (remainingMs <= 0) {
      throw new ArchiveValidationError('Remote content snapshot timed out.')
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), Math.min(ARCHIVE_TIMEOUT_MS, remainingMs))

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'mlog-public-content'
        },
        cache: 'no-store',
        signal: controller.signal
      })

      if (!response.ok) {
        if (attempt + 1 < MAX_FETCH_ATTEMPTS && shouldRetryStatus(response.status)) {
          await response.body?.cancel().catch(() => {})
          await wait(retryDelayMs(response, attempt))
          continue
        }
        throw new ArchiveValidationError(`GitHub ref request failed for ${repo} (${response.status}).`)
      }

      const payload = await response.json() as GithubRefResponse
      const sha = typeof payload.object?.sha === 'string' ? payload.object.sha.trim() : ''
      if (!/^[0-9a-f]{40}$/i.test(sha)) {
        throw new ArchiveValidationError(`GitHub ref response is invalid for ${repo}.`)
      }
      return sha
    } catch (error) {
      if (error instanceof ArchiveValidationError) {
        throw error
      }
      lastError = error
      if (Date.now() >= budget.deadline) {
        throw new ArchiveValidationError('Remote content snapshot timed out.')
      }
      if (attempt + 1 < MAX_FETCH_ATTEMPTS) {
        await wait(300 * 2 ** attempt)
        continue
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`GitHub ref request failed for ${repo}.`)
}

async function downloadRepoArchive(config: GithubContentConfig, repo: string, ref: string, budget: ArchiveBudget): Promise<Buffer> {
  const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(repo)}/tarball/${encodeURIComponent(ref)}`
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt += 1) {
    const remainingMs = budget.deadline - Date.now()
    if (remainingMs <= 0) {
      throw new ArchiveValidationError('Remote content snapshot timed out.')
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), Math.min(ARCHIVE_TIMEOUT_MS, remainingMs))

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'mlog-public-content'
        },
        cache: 'no-store',
        signal: controller.signal
      })

      if (!response.ok) {
        if (attempt + 1 < MAX_FETCH_ATTEMPTS && shouldRetryStatus(response.status)) {
          await response.body?.cancel().catch(() => {})
          await wait(retryDelayMs(response, attempt))
          continue
        }
        throw new ArchiveValidationError(`GitHub archive request failed for ${repo} (${response.status}).`)
      }

      const contentLength = Number(response.headers.get('content-length'))
      if (
        Number.isFinite(contentLength) &&
        (contentLength > MAX_ARCHIVE_BYTES || budget.compressedBytes + contentLength > MAX_TOTAL_ARCHIVE_BYTES)
      ) {
        await response.body?.cancel().catch(() => {})
        throw new ArchiveValidationError(`GitHub archive is too large for ${repo}.`)
      }

      return await readResponseBuffer(response, repo, budget)
    } catch (error) {
      if (error instanceof ArchiveValidationError) {
        throw error
      }
      lastError = error
      if (Date.now() >= budget.deadline) {
        throw new ArchiveValidationError('Remote content snapshot timed out.')
      }
      if (attempt + 1 < MAX_FETCH_ATTEMPTS) {
        await wait(300 * 2 ** attempt)
        continue
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`GitHub archive request failed for ${repo}.`)
}

function createExpandedArchiveLimiter(repo: string, budget: ArchiveBudget): Transform {
  let expandedBytes = 0
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      expandedBytes += chunk.length
      budget.expandedBytes += chunk.length
      if (
        expandedBytes > MAX_EXPANDED_ARCHIVE_BYTES ||
        budget.expandedBytes > MAX_TOTAL_EXPANDED_ARCHIVE_BYTES ||
        Date.now() > budget.deadline
      ) {
        callback(new ArchiveValidationError(`Expanded GitHub archive exceeded its resource budget at ${repo}.`))
        return
      }
      callback(null, chunk)
    }
  })
}

function repoRelativePath(archivePath: string): string | null {
  const separatorIndex = archivePath.indexOf('/')
  if (separatorIndex < 0) {
    return null
  }

  const relativePath = archivePath.slice(separatorIndex + 1)
  if (!relativePath || relativePath.startsWith('/') || relativePath.split('/').includes('..')) {
    return null
  }
  return relativePath
}

function shouldReadArchivePath(repoPath: string, includeSystem: boolean): boolean {
  return POST_FILE_RE.test(repoPath) || REPO_CARDS_FILE_RE.test(repoPath) || (includeSystem && repoPath === SHARD_REGISTRY_PATH)
}

async function extractContentFiles(
  archive: Buffer,
  includeSystem: boolean,
  repo: string,
  contentBudget: { bytes: number; files: number },
  archiveBudget: ArchiveBudget
): Promise<Map<string, Buffer>> {
  const extract = tar.extract()
  const files = new Map<string, Buffer>()
  let archiveEntries = 0
  let selectedBytes = 0

  extract.on('entry', (header, stream, next) => {
    archiveEntries += 1
    archiveBudget.entries += 1
    if (
      archiveEntries > MAX_ARCHIVE_ENTRIES ||
      archiveBudget.entries > MAX_TOTAL_ARCHIVE_ENTRIES ||
      Date.now() > archiveBudget.deadline
    ) {
      stream.resume()
      extract.destroy(new ArchiveValidationError(`GitHub archive has too many entries for ${repo}.`))
      return
    }

    const repoPath = repoRelativePath(header.name)
    if (header.type !== 'file' || !repoPath || !shouldReadArchivePath(repoPath, includeSystem)) {
      stream.on('end', next)
      stream.on('error', error => extract.destroy(error))
      stream.resume()
      return
    }

    if (files.has(repoPath) || files.size >= contentBudget.files) {
      stream.resume()
      extract.destroy(new ArchiveValidationError(
        files.has(repoPath)
          ? `Duplicate content path in ${repo}: ${repoPath}`
          : `GitHub archive has too many content files for ${repo}.`
      ))
      return
    }

    if (Number(header.size) > MAX_ENTRY_BYTES) {
      stream.resume()
      extract.destroy(new ArchiveValidationError(`Content archive entry is too large: ${repoPath}`))
      return
    }

    const chunks: Buffer[] = []
    let entryBytes = 0
    let failed = false
    stream.on('data', chunk => {
      if (failed) {
        return
      }
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      entryBytes += buffer.length
      selectedBytes += buffer.length
      if (entryBytes > MAX_ENTRY_BYTES || selectedBytes > contentBudget.bytes) {
        failed = true
        extract.destroy(new ArchiveValidationError(
          entryBytes > MAX_ENTRY_BYTES
            ? `Content archive entry is too large: ${repoPath}`
            : `GitHub archive content is too large for ${repo}.`
        ))
        return
      }
      chunks.push(buffer)
    })
    stream.on('end', () => {
      if (failed || extract.destroyed) {
        return
      }
      files.set(repoPath, Buffer.concat(chunks))
      next()
    })
    stream.on('error', error => extract.destroy(error))
  })

  await pipeline(
    Readable.from([archive]),
    createGunzip(),
    createExpandedArchiveLimiter(repo, archiveBudget),
    extract
  )
  return files
}

function parsePost(raw: Buffer, slug: string, locale: Locale, label: string): Post {
  try {
    const parsed = parsePostMatter(raw.toString('utf8'))
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
  } catch (error) {
    throw error instanceof Error ? error : new Error(`Invalid remote markdown in ${label}.`)
  }
}

function isAllowedShardRepo(config: GithubContentConfig, repo: string): boolean {
  const candidate = repo.toLowerCase()
  const primary = config.primaryRepo.toLowerCase()
  if (candidate === primary) {
    return true
  }

  const prefix = config.shardPrefix.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${prefix}-shard-[1-9]\\d*$`).test(candidate)
}

function readShardRepos(config: GithubContentConfig, primaryFiles: Map<string, Buffer>): string[] {
  const registryFile = primaryFiles.get(SHARD_REGISTRY_PATH)
  if (!registryFile) {
    return [config.primaryRepo]
  }

  try {
    const registry = shardRegistrySchema.parse(JSON.parse(registryFile.toString('utf8')))
    const repos = [config.primaryRepo]
    const seen = new Set([config.primaryRepo.toLowerCase()])
    for (const shard of registry.shards) {
      if (!isAllowedShardRepo(config, shard.repo)) {
        throw new Error(`repository is outside the configured shard namespace: ${shard.repo}`)
      }
      const key = shard.repo.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        repos.push(shard.repo)
      }
    }
    return repos
  } catch (error) {
    throw new Error(`Invalid remote shard registry: ${error instanceof Error ? error.message : error}`)
  }
}

async function loadRemoteContentSnapshot(): Promise<RemoteContentSnapshot | null> {
  const config = readGithubContentConfig()
  if (!config) {
    return null
  }

  const archiveBudget: ArchiveBudget = {
    compressedBytes: 0,
    expandedBytes: 0,
    entries: 0,
    deadline: Date.now() + SNAPSHOT_TIMEOUT_MS
  }

  const primaryRef = await resolveRepoHead(config, config.primaryRepo, archiveBudget)
  const primaryArchive = await downloadRepoArchive(config, config.primaryRepo, primaryRef, archiveBudget)
  const primaryFiles = await extractContentFiles(primaryArchive, true, config.primaryRepo, {
    bytes: MAX_SNAPSHOT_CONTENT_BYTES,
    files: MAX_SNAPSHOT_FILES
  }, archiveBudget)
  const repos = readShardRepos(config, primaryFiles)
  const files = new Map(primaryFiles)
  const slugOwners = new Map<string, string>()
  for (const repoPath of primaryFiles.keys()) {
    const slug = repoPath.match(POST_SLUG_PATH_RE)?.[1]
    if (slug) slugOwners.set(slug, config.primaryRepo)
  }
  let totalContentBytes = Array.from(primaryFiles.values()).reduce((total, content) => total + content.length, 0)
  for (const repo of repos.slice(1)) {
    const ref = await resolveRepoHead(config, repo, archiveBudget)
    const archive = await downloadRepoArchive(config, repo, ref, archiveBudget)
    const entries = await extractContentFiles(archive, false, repo, {
      bytes: MAX_SNAPSHOT_CONTENT_BYTES - totalContentBytes,
      files: MAX_SNAPSHOT_FILES - files.size
    }, archiveBudget)
    for (const [repoPath, content] of entries) {
      const slug = repoPath.match(POST_SLUG_PATH_RE)?.[1]
      const existingOwner = slug ? slugOwners.get(slug) : undefined
      if (slug && existingOwner && existingOwner !== repo) {
        throw new Error(`Post slug is split across shards: ${slug} (${existingOwner}, ${repo})`)
      }
      if (files.has(repoPath)) {
        throw new Error(`Duplicate content path across shards: ${repoPath}`)
      }
      totalContentBytes += content.length
      if (files.size >= MAX_SNAPSHOT_FILES || totalContentBytes > MAX_SNAPSHOT_CONTENT_BYTES) {
        throw new Error('Remote content snapshot exceeds its configured size limits.')
      }
      files.set(repoPath, content)
      if (slug) slugOwners.set(slug, repo)
    }
  }

  const posts: Post[] = []
  const repoCardsBySlug: Record<string, RepoCardsConfig> = {}

  for (const [repoPath, content] of files) {
    const postMatch = repoPath.match(POST_FILE_RE)
    if (postMatch) {
      posts.push(parsePost(content, postMatch[1], postMatch[2] as Locale, repoPath))
      continue
    }

    const repoCardsMatch = repoPath.match(REPO_CARDS_FILE_RE)
    if (repoCardsMatch) {
      repoCardsBySlug[repoCardsMatch[1]] = parseRepoCardsConfigOrDefault(content.toString('utf8'))
    }
  }

  return { posts, repoCardsBySlug }
}

const getCompressedRemoteContentSnapshot = unstable_cache(
  async (): Promise<string | null> => {
    const snapshot = await loadRemoteContentSnapshot()
    if (!snapshot) {
      return null
    }
    const serialized = JSON.stringify(snapshot)
    if (Buffer.byteLength(serialized, 'utf8') > MAX_SERIALIZED_SNAPSHOT_BYTES) {
      throw new ArchiveValidationError('Serialized remote content snapshot exceeds its configured size limit.')
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
  if (!compressed) {
    return null
  }

  const serialized = gunzipSync(Buffer.from(compressed, 'base64'), {
    maxOutputLength: MAX_SERIALIZED_SNAPSHOT_BYTES
  }).toString('utf8')
  return JSON.parse(serialized) as RemoteContentSnapshot
}

export async function getRemoteContentSnapshotUncached(): Promise<RemoteContentSnapshot | null> {
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return null
  }
  return loadRemoteContentSnapshot()
}
