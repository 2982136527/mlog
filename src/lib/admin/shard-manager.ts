import { z } from 'zod'
import {
  buildShardRepoEnv,
  getContentGithubReadEnv,
  getContentGithubReadEnvForRepo,
  getContentGithubShardPrefix,
  getAdminGithubEnv,
  type GithubRepoEnv
} from '@/lib/admin/env'
import {
  buildBranchName,
  createBranch,
  createPullRequest,
  encodeTextBase64,
  getRepoTextFile,
  listContentMarkdownPaths,
  mergePullRequest,
  upsertFile
} from '@/lib/admin/github-client'

const SHARD_REGISTRY_PATH = 'content/system/shards.json'
export const MAX_CONTENT_SHARDS = 16

const shardEntrySchema = z.object({
  id: z.string(),
  repo: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/),
  status: z.enum(['active', 'archived']),
  createdAt: z.string(),
  lastSizeCheckAt: z.string(),
  lastSizeKB: z.number()
})

const shardRegistrySchema = z.object({
  version: z.number().int().positive(),
  shards: z.array(shardEntrySchema).min(1).max(MAX_CONTENT_SHARDS),
  activeShardId: z.string(),
  updatedAt: z.string()
}).superRefine((registry, ctx) => {
  const ids = new Set<string>()
  const repos = new Set<string>()
  for (const [index, shard] of registry.shards.entries()) {
    const repoKey = shard.repo.toLowerCase()
    if (ids.has(shard.id)) {
      ctx.addIssue({ code: 'custom', path: ['shards', index, 'id'], message: `duplicate shard id: ${shard.id}` })
    }
    if (repos.has(repoKey)) {
      ctx.addIssue({ code: 'custom', path: ['shards', index, 'repo'], message: `duplicate shard repo: ${shard.repo}` })
    }
    ids.add(shard.id)
    repos.add(repoKey)
  }

  const active = registry.shards.filter(shard => shard.status === 'active')
  if (active.length !== 1 || active[0]?.id !== registry.activeShardId) {
    ctx.addIssue({
      code: 'custom',
      path: ['activeShardId'],
      message: 'activeShardId must reference the only active shard'
    })
  }
})

export type ShardEntry = z.infer<typeof shardEntrySchema>
export type ShardRegistry = z.infer<typeof shardRegistrySchema>

function assertRegistryMatchesEnvironment(registry: ShardRegistry, primaryRepo: string): void {
  const primaryCount = registry.shards.filter(shard => shard.repo.toLowerCase() === primaryRepo.toLowerCase()).length
  if (primaryCount !== 1) {
    throw new Error(`Shard registry must contain primary repository exactly once: ${primaryRepo}`)
  }

  const prefix = getContentGithubShardPrefix().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const shardNamePattern = new RegExp(`^${prefix}-shard-[1-9]\\d*$`)
  for (const shard of registry.shards) {
    const repo = shard.repo.toLowerCase()
    if (repo !== primaryRepo.toLowerCase() && !shardNamePattern.test(repo)) {
      throw new Error(`Shard repository is outside the configured namespace: ${shard.repo}`)
    }
  }
}

function buildSyntheticRegistry(): ShardRegistry {
  const primaryRepo = getAdminGithubEnv()
  const now = new Date().toISOString()
  return {
    version: 1,
    shards: [
      {
        id: 'shard-001',
        repo: primaryRepo.repo,
        status: 'active',
        createdAt: now,
        lastSizeCheckAt: now,
        lastSizeKB: 0
      }
    ],
    activeShardId: 'shard-001',
    updatedAt: now
  }
}

let cachedRegistry: { registry: ShardRegistry; loadedAt: number } | null = null
const REGISTRY_CACHE_TTL = 30_000

export async function loadShardRegistry(): Promise<ShardRegistry> {
  if (cachedRegistry && Date.now() - cachedRegistry.loadedAt < REGISTRY_CACHE_TTL) {
    return cachedRegistry.registry
  }

  const primaryEnv = getContentGithubReadEnv()
  const file = await getRepoTextFile(SHARD_REGISTRY_PATH, primaryEnv.baseBranch, primaryEnv)

  if (!file) {
    const synthetic = buildSyntheticRegistry()
    cachedRegistry = { registry: synthetic, loadedAt: Date.now() }
    return synthetic
  }

  try {
    const parsed = shardRegistrySchema.parse(JSON.parse(file.content))
    assertRegistryMatchesEnvironment(parsed, primaryEnv.repo)
    cachedRegistry = { registry: parsed, loadedAt: Date.now() }
    return parsed
  } catch (error) {
    throw new Error(`Invalid shard registry: ${error instanceof Error ? error.message : error}`)
  }
}

export function invalidateShardRegistryCache(): void {
  cachedRegistry = null
}

export async function saveShardRegistry(registry: ShardRegistry): Promise<{
  prNumber: number
  prUrl: string
  merged: boolean
  mergeMessage: string
}> {
  const validatedRegistry = shardRegistrySchema.parse(registry)
  const env = getAdminGithubEnv()
  assertRegistryMatchesEnvironment(validatedRegistry, env.repo)
  const branch = buildBranchName('automation', 'shard-registry-update')

  const existing = await getRepoTextFile(SHARD_REGISTRY_PATH, env.baseBranch, env)
  const content = JSON.stringify(validatedRegistry, null, 2)

  await createBranch(branch, env)

  await upsertFile(
    {
      path: SHARD_REGISTRY_PATH,
      contentBase64: encodeTextBase64(content),
      branch,
      message: `Update shard registry (${validatedRegistry.activeShardId})`,
      sha: existing?.sha
    },
    env
  )

  const pr = await createPullRequest(
    {
      title: `Update shard registry: active=${validatedRegistry.activeShardId}`,
      body: `Shard registry update\n\nActive shard: ${validatedRegistry.activeShardId}\nTotal shards: ${validatedRegistry.shards.length}`,
      head: branch,
      base: env.baseBranch
    },
    env
  )

  const merge = env.autoMerge
    ? await mergePullRequest(pr.number, env)
    : { merged: false, message: 'Auto merge disabled' }

  invalidateShardRegistryCache()
  return {
    prNumber: pr.number,
    prUrl: pr.html_url,
    merged: merge.merged,
    mergeMessage: merge.message
  }
}

export async function getActiveShardEnv(): Promise<GithubRepoEnv> {
  const registry = await loadShardRegistry()
  const active = registry.shards.find(s => s.id === registry.activeShardId)
  if (!active) {
    throw new Error(`Active shard is missing from registry: ${registry.activeShardId}`)
  }
  return buildShardRepoEnv(active.repo)
}

export async function getAllShardEnvs(): Promise<GithubRepoEnv[]> {
  const registry = await loadShardRegistry()
  return registry.shards.map(s => buildShardRepoEnv(s.repo))
}

// Cache: slug -> shard repo name (30s TTL)
let slugShardCache: { map: Map<string, string>; loadedAt: number } | null = null
const SLUG_SHARD_CACHE_TTL = 30_000

async function buildSlugShardMap(): Promise<Map<string, string>> {
  if (slugShardCache && Date.now() - slugShardCache.loadedAt < SLUG_SHARD_CACHE_TTL) {
    return slugShardCache.map
  }

  const registry = await loadShardRegistry()
  const map = new Map<string, string>()

  for (const shard of registry.shards) {
    const readEnv = getContentGithubReadEnvForRepo(shard.repo)
    const paths = await listContentMarkdownPaths(readEnv.baseBranch, readEnv)
    for (const p of paths) {
      const match = p.match(/^content\/posts\/([^/]+)\/(zh|en)\.md$/)
      if (match) {
        const existingRepo = map.get(match[1])
        if (existingRepo && existingRepo !== shard.repo) {
          throw new Error(`Duplicate post slug across shards: ${match[1]} (${existingRepo}, ${shard.repo})`)
        }
        map.set(match[1], shard.repo)
      }
    }
  }

  slugShardCache = { map, loadedAt: Date.now() }
  return map
}

export function invalidateSlugShardCache(): void {
  slugShardCache = null
}

export async function findShardForPost(slug: string): Promise<GithubRepoEnv | null> {
  const map = await buildSlugShardMap()
  const repo = map.get(slug)
  if (!repo) {
    return null
  }
  return buildShardRepoEnv(repo)
}

export async function listAllContentMarkdownPaths(): Promise<Map<string, GithubRepoEnv>> {
  const registry = await loadShardRegistry()
  const result = new Map<string, GithubRepoEnv>()
  const slugOwners = new Map<string, string>()

  for (const shard of registry.shards) {
    const readEnv = getContentGithubReadEnvForRepo(shard.repo)
    const paths = await listContentMarkdownPaths(readEnv.baseBranch, readEnv)
    for (const p of paths) {
      const match = p.match(/^content\/posts\/([^/]+)\/(zh|en)\.md$/)
      if (!match) continue

      const existingRepo = slugOwners.get(match[1])
      if (existingRepo && existingRepo !== shard.repo) {
        throw new Error(`Duplicate post slug across shards: ${match[1]} (${existingRepo}, ${shard.repo})`)
      }
      slugOwners.set(match[1], shard.repo)
      if (result.has(p)) {
        throw new Error(`Duplicate content path across shards: ${p}`)
      }
      result.set(p, buildShardRepoEnv(shard.repo))
    }
  }

  return result
}
