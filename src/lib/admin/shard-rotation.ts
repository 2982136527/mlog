import {
  buildShardRepoEnv,
  getContentGithubShardPrefix,
  getAdminGithubEnv
} from '@/lib/admin/env'
import { createRepo, getRepoInfo } from '@/lib/admin/github-client'
import {
  loadShardRegistry,
  saveShardRegistry,
  invalidateShardRegistryCache,
  invalidateSlugShardCache,
  type ShardRegistry,
  type ShardEntry
} from '@/lib/admin/shard-manager'

const SIZE_THRESHOLD_KB = 4 * 1024 * 1024 // 4GB in KB
const CHECK_COOLDOWN_MS = 60 * 60 * 1000 // 1 hour
const REPO_POLL_INTERVAL_MS = 2000
const REPO_POLL_MAX_ATTEMPTS = 15

function nextShardId(registry: ShardRegistry): string {
  const maxNum = registry.shards.reduce((max, shard) => {
    const match = shard.id.match(/^shard-(\d+)$/)
    if (match) {
      return Math.max(max, parseInt(match[1], 10))
    }
    return max
  }, 0)
  return `shard-${String(maxNum + 1).padStart(3, '0')}`
}

function nextShardRepoName(registry: ShardRegistry): string {
  const prefix = getContentGithubShardPrefix()
  const maxNum = registry.shards.reduce((max, shard) => {
    const match = shard.repo.match(new RegExp(`^${escapeRegex(prefix)}-shard-(\\d+)$`))
    if (match) {
      return Math.max(max, parseInt(match[1], 10))
    }
    // Also check if the primary repo matches the prefix pattern
    const primaryMatch = shard.repo.match(new RegExp(`^${escapeRegex(prefix)}(\\d+)$`))
    if (primaryMatch) {
      return Math.max(max, parseInt(primaryMatch[1], 10))
    }
    return max
  }, 0)
  return `${prefix}-shard-${maxNum + 1}`
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function waitForRepoReady(owner: string, repo: string, token: string): Promise<void> {
  for (let i = 0; i < REPO_POLL_MAX_ATTEMPTS; i++) {
    try {
      await getRepoInfo(owner, repo, token)
      return
    } catch {
      await new Promise(resolve => setTimeout(resolve, REPO_POLL_INTERVAL_MS))
    }
  }
  throw new Error(`Repo ${owner}/${repo} not ready after ${REPO_POLL_MAX_ATTEMPTS} attempts`)
}

export async function checkAndRotateShard(): Promise<{ rotated: boolean; newShard?: ShardEntry }> {
  const registry = await loadShardRegistry()
  const activeShard = registry.shards.find(s => s.id === registry.activeShardId)

  if (!activeShard) {
    return { rotated: false }
  }

  // Cooldown: skip if checked recently
  const lastCheck = new Date(activeShard.lastSizeCheckAt).getTime()
  if (Date.now() - lastCheck < CHECK_COOLDOWN_MS) {
    return { rotated: false }
  }

  const env = getAdminGithubEnv()
  let sizeKB: number

  try {
    const info = await getRepoInfo(env.owner, activeShard.repo, env.token)
    sizeKB = info.size
  } catch (error) {
    console.warn(`[shard-rotation] Failed to check repo size: ${error instanceof Error ? error.message : error}`)
    return { rotated: false }
  }

  // Update size metadata
  activeShard.lastSizeCheckAt = new Date().toISOString()
  activeShard.lastSizeKB = sizeKB
  registry.updatedAt = new Date().toISOString()

  if (sizeKB < SIZE_THRESHOLD_KB) {
    // Under threshold, just save updated metadata
    try {
      await saveShardRegistry(registry)
    } catch (error) {
      console.warn(`[shard-rotation] Failed to save registry metadata: ${error instanceof Error ? error.message : error}`)
    }
    return { rotated: false }
  }

  // Over threshold — create new shard
  const newId = nextShardId(registry)
  const newRepoName = nextShardRepoName(registry)

  console.log(`[shard-rotation] Active shard ${activeShard.repo} is ${sizeKB}KB (>= ${SIZE_THRESHOLD_KB}KB). Creating new shard: ${newRepoName}`)

  try {
    await createRepo({
      org: env.owner,
      name: newRepoName,
      private: true,
      token: env.token
    })

    await waitForRepoReady(env.owner, newRepoName, env.token)

    const now = new Date().toISOString()
    const newShard: ShardEntry = {
      id: newId,
      repo: newRepoName,
      status: 'active',
      createdAt: now,
      lastSizeCheckAt: now,
      lastSizeKB: 0
    }

    activeShard.status = 'archived'
    registry.shards.push(newShard)
    registry.activeShardId = newId
    registry.updatedAt = now

    await saveShardRegistry(registry)
    invalidateShardRegistryCache()
    invalidateSlugShardCache()

    console.log(`[shard-rotation] New shard created and activated: ${newRepoName} (${newId})`)
    return { rotated: true, newShard }
  } catch (error) {
    console.error(`[shard-rotation] Failed to create new shard repo ${newRepoName}: ${error instanceof Error ? error.message : error}`)
    // Still try to save the updated size metadata
    try {
      await saveShardRegistry(registry)
    } catch {
      // Ignore secondary failure
    }
    return { rotated: false }
  }
}
