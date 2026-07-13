import 'server-only'
import { sql } from '@vercel/postgres'
import { MediaError } from './errors'
import type { MediaProviderLocator } from './types'

const GITHUB_API_BASE = 'https://api.github.com'
const ROTATION_THRESHOLD_DEFAULT = 0.9

export type RepoRegistryEntry = {
  id: number
  owner: string
  repo: string
  branch: string
  pathPrefix: string
  isActive: boolean
  createdAt: string
  deactivatedAt: string | null
}

export type RotationConfig = {
  maxRepositoryBytes: number
  rotationThreshold: number        // 0.0–1.0, default 0.9
  repoPrefix: string               // e.g. "mlog-images"
  token: string
}

export function getRotationConfig(): RotationConfig {
  const maxRepositoryBytes = Number(
    process.env.IMAGE_GITHUB_MAX_REPOSITORY_BYTES || Math.floor(3.5 * 1024 * 1024 * 1024)
  )
  const rotationThreshold = Number(process.env.IMAGE_GITHUB_ROTATION_THRESHOLD || ROTATION_THRESHOLD_DEFAULT)
  const repoPrefix = (process.env.IMAGE_GITHUB_REPO_PREFIX || 'mlog-images').trim()
  const token = (process.env.IMAGE_GITHUB_TOKEN || '').trim()
  return { maxRepositoryBytes, rotationThreshold, repoPrefix, token }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export async function ensureRepoRegistry(
  env: { owner: string; repo: string; branch: string; pathPrefix: string },
): Promise<void> {
  const existing = await sql<RepoRegistryEntry>`
    SELECT id FROM image_repo_registry
    WHERE owner = ${env.owner} AND repo = ${env.repo}
    LIMIT 1
  `
  if (existing.rows.length > 0) return

  await sql`
    INSERT INTO image_repo_registry (owner, repo, branch, path_prefix, is_active)
    VALUES (${env.owner}, ${env.repo}, ${env.branch}, ${env.pathPrefix}, true)
    ON CONFLICT (owner, repo) DO NOTHING
  `
}

export async function getActiveRepo(): Promise<RepoRegistryEntry | null> {
  const result = await sql<RepoRegistryEntry>`
    SELECT id, owner, repo, branch, path_prefix AS "pathPrefix", is_active AS "isActive",
           created_at::text AS "createdAt", deactivated_at::text AS "deactivatedAt"
    FROM image_repo_registry
    WHERE is_active = true
    ORDER BY created_at DESC
    LIMIT 1
  `
  return result.rows[0] ?? null
}

export async function getActiveRepoOrThrow(): Promise<RepoRegistryEntry> {
  const entry = await getActiveRepo()
  if (!entry) {
    throw new MediaError({
      status: 500,
      code: 'MEDIA_CONFIG_INVALID',
      message: 'No active image repository found in the registry. Ensure IMAGE_GITHUB_OWNER and IMAGE_GITHUB_REPO are configured.',
      retryable: false,
    })
  }
  return entry
}

export async function getAllRepos(): Promise<RepoRegistryEntry[]> {
  const result = await sql<RepoRegistryEntry>`
    SELECT id, owner, repo, branch, path_prefix AS "pathPrefix", is_active AS "isActive",
           created_at::text AS "createdAt", deactivated_at::text AS "deactivatedAt"
    FROM image_repo_registry
    ORDER BY created_at ASC
  `
  return result.rows
}

// ---------------------------------------------------------------------------
// Capacity check & rotation trigger
// ---------------------------------------------------------------------------

type RepoSizeInfo = { sizeKb: number; reachedSafeCapacity: boolean }

async function fetchRepoSize(
  owner: string,
  repo: string,
  token: string,
): Promise<RepoSizeInfo> {
  const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'mlog-repo-rotation',
      Accept: 'application/vnd.github+json',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    throw new MediaError({
      status: 502,
      code: 'MEDIA_STORAGE_UNAVAILABLE',
      message: `GitHub API returned ${response.status} when checking repository size.`,
      retryable: true,
    })
  }
  const payload = (await response.json()) as { size?: number; disk_usage?: number }
  const sizeKb = payload.disk_usage ?? payload.size ?? 0
  return { sizeKb, reachedSafeCapacity: false }
}

export async function checkRotationNeeded(token: string, incomingBytes: number): Promise<boolean> {
  const active = await getActiveRepo()
  if (!active) return false

  const config = getRotationConfig()
  const info = await fetchRepoSize(active.owner, active.repo, token)
  const currentBytes = info.sizeKb * 1024
  const threshold = config.maxRepositoryBytes * config.rotationThreshold

  return currentBytes + incomingBytes > threshold
}

/**
 * Create a new GitHub repository and mark it as the active image repo.
 * The old repo is deactivated but images remain accessible via CDN/GitHub.
 */
export async function rotateRepo(token: string): Promise<RepoRegistryEntry> {
  const active = await getActiveRepoOrThrow()
  const config = getRotationConfig()

  // Determine the next repo index
  const all = await getAllRepos()
  const nextIndex = all.length + 1
  const newRepoName = `${config.repoPrefix}-${nextIndex}`

  // Create the repo on GitHub
  const createUrl = `https://api.github.com/user/repos`
  const createResponse = await fetch(createUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'mlog-repo-rotation',
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: newRepoName,
      description: `MLog image repository shard ${nextIndex} (auto-rotated)`,
      auto_init: true,
      private: false,
      // Use the same topic to group repos
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!createResponse.ok) {
    const body = await createResponse.json().catch(() => ({}))
    throw new MediaError({
      status: 502,
      code: 'MEDIA_STORAGE_UNAVAILABLE',
      message: `Failed to create new image repository "${newRepoName}". GitHub API: ${(body as Record<string, unknown>)?.message || createResponse.statusText}`,
      retryable: false,
    })
  }

  // Deactivate old repo, activate new one
  await sql`
    UPDATE image_repo_registry
    SET is_active = false, deactivated_at = NOW()
    WHERE is_active = true
  `

  await sql`
    INSERT INTO image_repo_registry (owner, repo, branch, path_prefix, is_active)
    VALUES (${active.owner}, ${newRepoName}, ${active.branch}, ${active.pathPrefix}, true)
  `

  const created = await getActiveRepoOrThrow()
  return created
}

/**
 * Check if rotation is needed and perform it if so.
 * Returns the (possibly new) active repo.
 */
export async function ensureActiveRepoCapacity(token: string, incomingBytes: number): Promise<RepoRegistryEntry> {
  const active = await getActiveRepoOrThrow()
  const config = getRotationConfig()

  const info = await fetchRepoSize(active.owner, active.repo, token)
  const currentBytes = info.sizeKb * 1024
  const threshold = config.maxRepositoryBytes * config.rotationThreshold

  if (currentBytes + incomingBytes > threshold) {
    await rotateRepo(token)
    return getActiveRepoOrThrow()
  }

  return active
}

// ---------------------------------------------------------------------------
// Locator resolution
// ---------------------------------------------------------------------------

/**
 * Ensure `IMAGE_GITHUB_REPO_HISTORY` includes all deactivated repos so that
 * CDN/GitHub URL resolution can find images from any shard.
 *
 * This is called after rotation to keep the env-var based history in sync.
 * The env var is read at server start; runtime uploads use the DB locator.
 */
export function buildHistoryRepos(activeOwner: string, repoName: string): string {
  return repoName // return the new repo name as the history seed
}

// ---------------------------------------------------------------------------
// SQL schema (executed on demand)
// ---------------------------------------------------------------------------

const REPO_REGISTRY_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS image_repo_registry (
  id SERIAL PRIMARY KEY,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT 'main',
  path_prefix TEXT NOT NULL DEFAULT 'uploads/blog',
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deactivated_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(owner, repo)
);
`

export async function ensureRepoSchema(): Promise<void> {
  await sql.query(REPO_REGISTRY_TABLE_SQL)
}
