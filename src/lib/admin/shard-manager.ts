import { z } from 'zod'
import {
  buildShardRepoEnv,
  getContentGithubReadEnv,
  getContentGithubReadEnvForRepo,
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
import type { GithubRepoTarget } from '@/lib/admin/github-client'

const SHARD_REGISTRY_PATH = 'content/system/shards.json'

const shardEntrySchema = z.object({
  id: z.string(),
  repo: z.string(),
  status: z.enum(['active', 'archived']),
  createdAt: z.string(),
  lastSizeCheckAt: z.string(),
  lastSizeKB: z.number()
})

const shardRegistrySchema = z.object({
  version: z.number(),
  shards: z.array(shardEntrySchema),
  activeShardId: z.string(),
  updatedAt: z.string()
})

export type ShardEntry = z.infer<typeof shardEntrySchema>
export type ShardRegistry = z.infer<typeof shardRegistrySchema>

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
    cachedRegistry = { registry: parsed, loadedAt: Date.now() }
    return parsed
  } catch {
    const synthetic = buildSyntheticRegistry()
    cachedRegistry = { registry: synthetic, loadedAt: Date.now() }
    return synthetic
  }
}

export function invalidateShardRegistryCache(): void {
  cachedRegistry = null
}

export async function saveShardRegistry(registry: ShardRegistry): Promise<void> {
  const env = getAdminGithubEnv()
  const branch = buildBranchName('automation', 'shard-registry-update')

  const existing = await getRepoTextFile(SHARD_REGISTRY_PATH, env.baseBranch, env)
  const content = JSON.stringify(registry, null, 2)

  await createBranch(branch, env)

  await upsertFile(
    {
      path: SHARD_REGISTRY_PATH,
      contentBase64: encodeTextBase64(content),
      branch,
      message: `Update shard registry (${registry.activeShardId})`,
      sha: existing?.sha
    },
    env
  )

  const pr = await createPullRequest(
    {
      title: `Update shard registry: active=${registry.activeShardId}`,
      body: `Shard registry update\n\nActive shard: ${registry.activeShardId}\nTotal shards: ${registry.shards.length}`,
      head: branch,
      base: env.baseBranch
    },
    env
  )

  if (env.autoMerge) {
    await mergePullRequest(pr.number, env)
  }

  invalidateShardRegistryCache()
}

export async function getActiveShardEnv(): Promise<GithubRepoEnv> {
  const registry = await loadShardRegistry()
  const active = registry.shards.find(s => s.id === registry.activeShardId)
  if (!active) {
    return buildShardRepoEnv(getAdminGithubEnv().repo)
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
    const shardEnv = buildShardRepoEnv(shard.repo)
    const readEnv = getContentGithubReadEnvForRepo(shard.repo)
    try {
      const paths = await listContentMarkdownPaths(readEnv.baseBranch, readEnv)
      for (const p of paths) {
        const match = p.match(/^content\/posts\/([^/]+)\/(zh|en)\.md$/)
        if (match) {
          map.set(match[1], shard.repo)
        }
      }
    } catch {
      // Shard may not exist yet or be inaccessible
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

  for (const shard of registry.shards) {
    const readEnv = getContentGithubReadEnvForRepo(shard.repo)
    try {
      const paths = await listContentMarkdownPaths(readEnv.baseBranch, readEnv)
      for (const p of paths) {
        if (!result.has(p)) {
          result.set(p, buildShardRepoEnv(shard.repo))
        }
      }
    } catch {
      // Skip inaccessible shards
    }
  }

  return result
}
