#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import nextEnv from '@next/env'
import tar from 'tar-stream'

const { loadEnvConfig } = nextEnv
loadEnvConfig(process.cwd(), false)

const owner = (process.env.CONTENT_GITHUB_OWNER || '').trim()
const repo = (process.env.CONTENT_GITHUB_REPO || '').trim()
const baseBranch = (process.env.CONTENT_GITHUB_BASE_BRANCH || 'main').trim().replace(/^refs\/heads\//, '')
const token = (process.env.CONTENT_GITHUB_READ_TOKEN || process.env.CONTENT_GITHUB_WRITE_TOKEN || '').trim()

const SYSTEM_PREFIXES = ['content/system/', 'public/images/uploads/']
const POSTS_PREFIX = 'content/posts/'
const SHARD_REGISTRY_PATH = 'content/system/shards.json'
const POST_SLUG_PATH_RE = /^content\/posts\/([a-z0-9-]+)\//
const LOCAL_ROOTS = ['content/posts', 'content/system', 'public/images/uploads']
const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024
const MAX_EXPANDED_ARCHIVE_BYTES = 256 * 1024 * 1024
const MAX_TOTAL_ARCHIVE_BYTES = 100 * 1024 * 1024
const MAX_TOTAL_EXPANDED_ARCHIVE_BYTES = 512 * 1024 * 1024
const MAX_ENTRY_BYTES = 10 * 1024 * 1024
const MAX_ARCHIVE_ENTRIES = 20_000
const MAX_TOTAL_ARCHIVE_ENTRIES = 40_000
const MAX_SYNCED_FILES = 20_000
const MAX_SYNCED_BYTES = 256 * 1024 * 1024
const MAX_SHARDS = 16
const FETCH_TIMEOUT_MS = 30_000
const MAX_FETCH_ATTEMPTS = 3
const PULL_TIMEOUT_MS = 180_000
const shardPrefix = (process.env.CONTENT_GITHUB_SHARD_REPO_PREFIX || repo).trim()

if (!owner || !repo || !token) {
  console.log('[content:pull] skipped (missing CONTENT_GITHUB_OWNER/CONTENT_GITHUB_REPO/CONTENT_GITHUB_READ_TOKEN or CONTENT_GITHUB_WRITE_TOKEN)')
  process.exit(0)
}

class ArchiveValidationError extends Error {}

function archiveUrl(repoName) {
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/tarball/${encodeURIComponent(baseBranch)}`
}

function shouldRetry(status) {
  return status === 408 || status === 429 || status >= 500
}

function retryDelayMs(response, attempt) {
  const retryAfter = Number(response.headers.get('retry-after'))
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, 5_000)
  }
  return 500 * 2 ** attempt
}

async function wait(ms) {
  await new Promise(resolve => setTimeout(resolve, ms))
}

async function readResponseBuffer(response, repoName, archiveBudget) {
  if (!response.body) {
    throw new ArchiveValidationError(`[content:pull] archive response has no body (${repoName})`)
  }

  const reader = response.body.getReader()
  const chunks = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = Buffer.from(value)
      totalBytes += chunk.length
      archiveBudget.compressedBytes += chunk.length
      if (
        totalBytes > MAX_ARCHIVE_BYTES ||
        archiveBudget.compressedBytes > MAX_TOTAL_ARCHIVE_BYTES ||
        Date.now() > archiveBudget.deadline
      ) {
        await reader.cancel().catch(() => {})
        throw new ArchiveValidationError(`[content:pull] archive download exceeded its resource budget (${repoName})`)
      }
      chunks.push(chunk)
    }
  } finally {
    reader.releaseLock()
  }

  return Buffer.concat(chunks, totalBytes)
}

async function downloadRepoArchive(repoName, archiveBudget) {
  let lastError

  for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt += 1) {
    const remainingMs = archiveBudget.deadline - Date.now()
    if (remainingMs <= 0) {
      throw new ArchiveValidationError('[content:pull] sync timed out')
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), Math.min(FETCH_TIMEOUT_MS, remainingMs))

    try {
      const response = await fetch(archiveUrl(repoName), {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'mlog-content-pull'
        },
        cache: 'no-store',
        signal: controller.signal
      })

      if (!response.ok) {
        if (attempt + 1 < MAX_FETCH_ATTEMPTS && shouldRetry(response.status)) {
          await response.body?.cancel().catch(() => {})
          await wait(retryDelayMs(response, attempt))
          continue
        }
        throw new ArchiveValidationError(`[content:pull] archive request failed ${response.status} (${repoName})`)
      }

      const declaredSize = Number(response.headers.get('content-length'))
      if (
        Number.isFinite(declaredSize) &&
        (declaredSize > MAX_ARCHIVE_BYTES || archiveBudget.compressedBytes + declaredSize > MAX_TOTAL_ARCHIVE_BYTES)
      ) {
        await response.body?.cancel().catch(() => {})
        throw new ArchiveValidationError(`[content:pull] archive exceeds ${MAX_ARCHIVE_BYTES} bytes (${repoName})`)
      }

      return await readResponseBuffer(response, repoName, archiveBudget)
    } catch (error) {
      if (error instanceof ArchiveValidationError) {
        throw error
      }
      lastError = error
      if (Date.now() >= archiveBudget.deadline) {
        throw new ArchiveValidationError('[content:pull] sync timed out')
      }
      if (attempt + 1 < MAX_FETCH_ATTEMPTS) {
        await wait(500 * 2 ** attempt)
        continue
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`[content:pull] archive request failed (${repoName})`)
}

function createExpandedArchiveLimiter(repoName, archiveBudget) {
  let expandedBytes = 0
  return new Transform({
    transform(chunk, _encoding, callback) {
      expandedBytes += chunk.length
      archiveBudget.expandedBytes += chunk.length
      if (
        expandedBytes > MAX_EXPANDED_ARCHIVE_BYTES ||
        archiveBudget.expandedBytes > MAX_TOTAL_EXPANDED_ARCHIVE_BYTES ||
        Date.now() > archiveBudget.deadline
      ) {
        callback(new ArchiveValidationError(`[content:pull] expanded archive exceeded its resource budget (${repoName})`))
        return
      }
      callback(null, chunk)
    }
  })
}

function repoRelativePath(archivePath) {
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

function shouldKeep(repoPath, prefixes) {
  return prefixes.some(prefix => repoPath.startsWith(prefix))
}

async function extractRepoArchive(input) {
  const extract = tar.extract()
  const extractedPaths = []
  let registryContent = null
  let archiveEntries = 0

  extract.on('entry', (header, stream, next) => {
    archiveEntries += 1
    input.archiveBudget.entries += 1
    if (
      archiveEntries > MAX_ARCHIVE_ENTRIES ||
      input.archiveBudget.entries > MAX_TOTAL_ARCHIVE_ENTRIES ||
      Date.now() > input.archiveBudget.deadline
    ) {
      stream.resume()
      extract.destroy(new ArchiveValidationError(`[content:pull] archive has too many entries (${input.repoName})`))
      return
    }

    const repoPath = repoRelativePath(header.name)
    if (header.type !== 'file' || !repoPath || !shouldKeep(repoPath, input.prefixes)) {
      stream.on('end', next)
      stream.on('error', error => extract.destroy(error))
      stream.resume()
      return
    }

    if (input.seenPaths.has(repoPath)) {
      stream.resume()
      extract.destroy(new ArchiveValidationError(`[content:pull] duplicate content path across shards: ${repoPath}`))
      return
    }

    const slug = repoPath.match(POST_SLUG_PATH_RE)?.[1]
    const existingOwner = slug ? input.slugOwners.get(slug) : undefined
    if (slug && existingOwner && existingOwner !== input.repoName) {
      stream.resume()
      extract.destroy(new ArchiveValidationError(
        `[content:pull] post slug is split across shards: ${slug} (${existingOwner}, ${input.repoName})`
      ))
      return
    }
    if (slug) input.slugOwners.set(slug, input.repoName)

    if (
      Number(header.size) > MAX_ENTRY_BYTES ||
      input.syncState.files >= MAX_SYNCED_FILES ||
      input.syncState.bytes + Number(header.size) > MAX_SYNCED_BYTES
    ) {
      stream.resume()
      extract.destroy(new ArchiveValidationError(`[content:pull] sync limits exceeded at ${repoPath}`))
      return
    }

    const chunks = []
    let size = 0
    let failed = false
    stream.on('data', chunk => {
      if (failed) return

      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.length
      input.syncState.bytes += buffer.length
      if (size > MAX_ENTRY_BYTES || input.syncState.bytes > MAX_SYNCED_BYTES) {
        failed = true
        extract.destroy(new ArchiveValidationError(`[content:pull] sync limits exceeded at ${repoPath}`))
        return
      }
      chunks.push(buffer)
    })
    stream.on('end', () => {
      if (failed || extract.destroyed) return

      void (async () => {
        const content = Buffer.concat(chunks)
        const outputPath = path.resolve(input.stagingRoot, repoPath)
        const stagingPrefix = `${path.resolve(input.stagingRoot)}${path.sep}`
        if (!outputPath.startsWith(stagingPrefix)) {
          throw new ArchiveValidationError(`[content:pull] unsafe archive path: ${repoPath}`)
        }

        await fs.mkdir(path.dirname(outputPath), { recursive: true })
        await fs.writeFile(outputPath, content)
        input.seenPaths.add(repoPath)
        input.syncState.files += 1
        extractedPaths.push(repoPath)
        if (repoPath === SHARD_REGISTRY_PATH) {
          registryContent = content.toString('utf8')
        }
      })().then(next, error => extract.destroy(error))
    })
    stream.on('error', error => extract.destroy(error))
  })

  await pipeline(
    Readable.from([input.archive]),
    createGunzip(),
    createExpandedArchiveLimiter(input.repoName, input.archiveBudget),
    extract
  )

  return { extractedPaths, registryContent }
}

function isValidRepoName(value) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value)
}

function isAllowedShardRepo(repoName) {
  if (repoName.toLowerCase() === repo.toLowerCase()) return true

  const escapedPrefix = shardPrefix.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escapedPrefix}-shard-[1-9]\\d*$`).test(repoName.toLowerCase())
}

function readShardRepos(registryContent) {
  if (!registryContent) {
    return [repo]
  }

  let parsed
  try {
    parsed = JSON.parse(registryContent)
  } catch (error) {
    throw new Error(`[content:pull] invalid shard registry JSON: ${error instanceof Error ? error.message : error}`)
  }

  if (!parsed || !Array.isArray(parsed.shards) || parsed.shards.length === 0 || parsed.shards.length > MAX_SHARDS) {
    throw new Error(`[content:pull] invalid shard registry: shards must contain between 1 and ${MAX_SHARDS} entries`)
  }

  const repos = parsed.shards.map(shard => (typeof shard?.repo === 'string' ? shard.repo.trim() : ''))
  if (repos.some(repoName => !isValidRepoName(repoName) || !isAllowedShardRepo(repoName))) {
    throw new Error('[content:pull] invalid shard registry: every shard repo must be valid and inside the configured namespace')
  }

  const result = [repo]
  const seen = new Set([repo.toLowerCase()])
  for (const repoName of repos) {
    const key = repoName.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      result.push(repoName)
    }
  }
  return result
}

async function preserveGitkeep(stagingRoot, localRoot) {
  const source = path.join(process.cwd(), localRoot, '.gitkeep')
  const destination = path.join(stagingRoot, localRoot, '.gitkeep')
  try {
    await fs.access(source)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.copyFile(source, destination)
  } catch {
    // A tracked placeholder is optional in deployed build workspaces.
  }
}

async function replaceLocalRoot(stagingRoot, localRoot) {
  const target = path.join(process.cwd(), localRoot)
  const staged = path.join(stagingRoot, localRoot)
  const backup = `${target}.content-pull-backup-${process.pid}`

  await fs.mkdir(staged, { recursive: true })
  await preserveGitkeep(stagingRoot, localRoot)
  await fs.rm(backup, { recursive: true, force: true })

  let hadTarget = true
  try {
    await fs.rename(target, backup)
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error
    }
    hadTarget = false
  }

  try {
    await fs.rename(staged, target)
    await fs.rm(backup, { recursive: true, force: true })
  } catch (error) {
    await fs.rm(target, { recursive: true, force: true })
    if (hadTarget) {
      await fs.rename(backup, target)
    }
    throw error
  }
}

async function recoverStaleBackups() {
  for (const localRoot of LOCAL_ROOTS) {
    const target = path.join(process.cwd(), localRoot)
    const parent = path.dirname(target)
    const backupPrefix = `${path.basename(target)}.content-pull-backup-`
    const entries = await fs.readdir(parent, { withFileTypes: true }).catch(error => {
      if (error?.code === 'ENOENT') return []
      throw error
    })
    const backupNames = entries
      .filter(entry => entry.name.startsWith(backupPrefix))
      .map(entry => entry.name)

    if (backupNames.length === 0) continue

    const targetExists = await fs.access(target).then(() => true, () => false)
    if (!targetExists) {
      const backupsByAge = await Promise.all(
        backupNames.map(async name => ({ name, stat: await fs.stat(path.join(parent, name)) }))
      )
      backupsByAge.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
      const newest = backupsByAge[0].name
      await fs.rename(path.join(parent, newest), target)
      console.warn(`[content:pull] restored interrupted backup for ${localRoot}`)
      backupNames.splice(backupNames.indexOf(newest), 1)
    }

    await Promise.all(backupNames.map(name => fs.rm(path.join(parent, name), { recursive: true, force: true })))
  }
}

async function main() {
  const stagingRoot = path.join(process.cwd(), `.content-pull-tmp-${process.pid}-${Date.now()}`)
  const seenPaths = new Set()
  const slugOwners = new Map()
  const syncState = { bytes: 0, files: 0 }
  const archiveBudget = {
    compressedBytes: 0,
    expandedBytes: 0,
    entries: 0,
    deadline: Date.now() + PULL_TIMEOUT_MS
  }

  try {
    await recoverStaleBackups()
    await fs.mkdir(stagingRoot, { recursive: true })

    const primaryArchive = await downloadRepoArchive(repo, archiveBudget)
    const primaryResult = await extractRepoArchive({
      archive: primaryArchive,
      prefixes: [POSTS_PREFIX, ...SYSTEM_PREFIXES],
      stagingRoot,
      seenPaths,
      slugOwners,
      syncState,
      archiveBudget,
      repoName: repo
    })
    console.log(`[content:pull] primary ${repo}: synced ${primaryResult.extractedPaths.length} files from one archive`)

    const repos = readShardRepos(primaryResult.registryContent)
    for (const shardRepo of repos.slice(1)) {
      const archive = await downloadRepoArchive(shardRepo, archiveBudget)
      const result = await extractRepoArchive({
        archive,
        prefixes: [POSTS_PREFIX],
        stagingRoot,
        seenPaths,
        slugOwners,
        syncState,
        archiveBudget,
        repoName: shardRepo
      })
      console.log(`[content:pull] shard ${shardRepo}: synced ${result.extractedPaths.length} files from one archive`)
    }

    for (const localRoot of LOCAL_ROOTS) {
      await replaceLocalRoot(stagingRoot, localRoot)
    }

    console.log(`[content:pull] total: ${seenPaths.size} files from ${repos.length} archive(s)`)
  } finally {
    await fs.rm(stagingRoot, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
