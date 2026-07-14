#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import nextEnv from '@next/env'

const { loadEnvConfig } = nextEnv
loadEnvConfig(process.cwd(), false)

const GITHUB_API_BASE = 'https://api.github.com'
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com'
const FETCH_CONCURRENCY = 30
const MAX_FETCH_ATTEMPTS = 3
const MAX_FILE_BYTES = 10 * 1024 * 1024

const owner = (process.env.CONTENT_GITHUB_OWNER || '').trim()
const repo = (process.env.CONTENT_GITHUB_REPO || '').trim()
const baseBranch = (process.env.CONTENT_GITHUB_BASE_BRANCH || 'main').trim().replace(/^refs\/heads\//, '')
const token = (process.env.CONTENT_GITHUB_READ_TOKEN || process.env.CONTENT_GITHUB_WRITE_TOKEN || '').trim()
const shardPrefix = (process.env.CONTENT_GITHUB_SHARD_REPO_PREFIX || repo).trim()

const LOCAL_ROOTS = ['content/posts', 'content/system', 'public/images/uploads']
const SHARD_REGISTRY_PATH = 'content/system/shards.json'
const POST_SLUG_PATH_RE = /^content\/posts\/([a-z0-9-]+)\//
const PULL_TIMEOUT_MS = 180_000

if (!owner || !repo || !token) {
  console.log('[content:pull] skipped (missing env vars)')
  process.exit(0)
}

function isRelevantPath(repoPath) {
  const systemPrefixes = ['content/system/', 'public/images/uploads/']
  const postPrefix = 'content/posts/'
  return repoPath.startsWith(postPrefix) || systemPrefixes.some(p => repoPath.startsWith(p))
}

async function apiFetch(url, signal) {
  for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'mlog-content-pull'
        },
        cache: 'no-store',
        signal
      })
      if (!response.ok) {
        if (attempt + 1 < MAX_FETCH_ATTEMPTS && (response.status === 408 || response.status === 429 || response.status >= 500)) {
          await new Promise(r => setTimeout(r, 300 * 2 ** attempt))
          continue
        }
        throw new Error(`API ${url} (${response.status})`)
      }
      return response.json()
    } catch (error) {
      if (attempt + 1 >= MAX_FETCH_ATTEMPTS) throw error
      await new Promise(r => setTimeout(r, 300 * 2 ** attempt))
    }
  }
}

async function resolveCommitSha(repoName, signal) {
  const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/git/ref/heads/${encodeURIComponent(baseBranch)}`
  const data = await apiFetch(url, signal)
  const sha = typeof data.object?.sha === 'string' ? data.object.sha.trim() : ''
  if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error(`Invalid SHA for ${repoName}`)
  return sha
}

async function getRecursiveTree(repoName, commitSha, signal) {
  const commit = await apiFetch(
    `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/git/commits/${commitSha}`,
    signal
  )
  const tree = await apiFetch(
    `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/git/trees/${commit.tree.sha}?recursive=1`,
    signal
  )
  if (tree.truncated) throw new Error(`Tree truncated for ${repoName}: ${tree.tree.length} entries`)
  return tree.tree
}

async function fetchFile(repoName, commitSha, filePath) {
  const segments = filePath.split('/').map(s => encodeURIComponent(s)).join('/')
  const url = `${GITHUB_RAW_BASE}/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/${commitSha}/${segments}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal
    })
    if (!response.ok) throw new Error(`Fetch ${filePath} (${response.status})`)
    const text = await response.text()
    if (Buffer.byteLength(text, 'utf8') > MAX_FILE_BYTES) throw new Error(`File too large: ${filePath}`)
    return text
  } finally {
    clearTimeout(timeout)
  }
}

async function batchFetch(repoName, commitSha, entries) {
  const results = {}
  for (let i = 0; i < entries.length; i += FETCH_CONCURRENCY) {
    const batch = entries.slice(i, i + FETCH_CONCURRENCY)
    const fetched = await Promise.allSettled(batch.map(e => fetchFile(repoName, commitSha, e.path)))
    for (let j = 0; j < fetched.length; j++) {
      if (fetched[j].status === 'fulfilled') results[batch[j].path] = fetched[j].value
      else console.warn(`[content:pull][warn] ${batch[j].path}: ${fetched[j].reason?.message || fetched[j].reason}`)
    }
  }
  return results
}

async function writeFiles(files) {
  let count = 0
  for (const [filePath, content] of Object.entries(files)) {
    const absPath = path.join(process.cwd(), filePath)
    await fs.mkdir(path.dirname(absPath), { recursive: true })
    await fs.writeFile(absPath, content, 'utf8')
    count++
  }
  return count
}

async function main() {
  const deadline = Date.now() + PULL_TIMEOUT_MS
  console.log(`[content:pull] fetching from ${owner}/${repo} (${baseBranch})`)

  const signal = AbortSignal.timeout(PULL_TIMEOUT_MS)

  // 1. Get primary repo tree
  const primarySha = await resolveCommitSha(repo, signal)
  console.log(`[content:pull] primary commit: ${primarySha.slice(0, 8)}`)

  const primaryTree = await getRecursiveTree(repo, primarySha, signal)
  console.log(`[content:pull] primary tree: ${primaryTree.length} entries`)

  // 2. Read shard registry
  const registryEntry = primaryTree.find(e => e.path === SHARD_REGISTRY_PATH)
  let repos = [repo]
  if (registryEntry) {
    try {
      const registryContent = await fetchFile(repo, primarySha, SHARD_REGISTRY_PATH)
      const registry = JSON.parse(registryContent)
      if (Array.isArray(registry.shards)) {
        const seen = new Set([repo.toLowerCase()])
        const prefix = shardPrefix.toLowerCase().replace(/[.*+?^{}()|[\]\\]/g, '\\$&')
        const allowed = new RegExp(`^${prefix}-shard-[1-9]\\d*$`)
        for (const shard of registry.shards) {
          if (typeof shard.repo === 'string' && allowed.test(shard.repo.toLowerCase()) && !seen.has(shard.repo.toLowerCase())) {
            seen.add(shard.repo.toLowerCase())
            repos.push(shard.repo)
          }
        }
      }
    } catch (e) {
      console.warn(`[content:pull][warn] shard registry: ${e.message}`)
    }
  }
  console.log(`[content:pull] repos: ${repos.join(', ')}`)

  // 3. Collect relevant files from all repos
  const allFiles = {}
  for (const repoName of repos) {
    const sha = repoName === repo ? primarySha : await resolveCommitSha(repoName, signal)
    const tree = repoName === repo ? primaryTree : await getRecursiveTree(repoName, sha, signal)
    const entries = tree.filter(e => e.type === 'blob' && isRelevantPath(e.path) && !allFiles[e.path])
    if (Date.now() > deadline) throw new Error('[content:pull] timed out')
    const files = await batchFetch(repoName, sha, entries)
    Object.assign(allFiles, files)
    console.log(`[content:pull] ${repoName}: ${entries.length} files`)
    if (Date.now() > deadline) throw new Error('[content:pull] timed out')
  }

  // 4. Write to disk
  const count = await writeFiles(allFiles)
  console.log(`[content:pull] done: ${count} files written`)
}

main().catch(error => {
  console.error(`[content:pull] failed: ${error.message}`)
  process.exit(1)
})
