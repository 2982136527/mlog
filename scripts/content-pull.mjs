#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'

const owner = (process.env.CONTENT_GITHUB_OWNER || '').trim()
const repo = (process.env.CONTENT_GITHUB_REPO || '').trim()
const baseBranch = (process.env.CONTENT_GITHUB_BASE_BRANCH || 'main').trim().replace(/^refs\/heads\//, '')
const token = (process.env.CONTENT_GITHUB_READ_TOKEN || process.env.CONTENT_GITHUB_WRITE_TOKEN || process.env.GITHUB_WRITE_TOKEN || '').trim()

const includePrefixes = ['content/posts/', 'content/system/', 'public/images/uploads/']

if (!owner || !repo || !token) {
  console.log('[content:pull] skipped (missing CONTENT_GITHUB_OWNER/CONTENT_GITHUB_REPO/CONTENT_GITHUB_READ_TOKEN)')
  process.exit(0)
}

const apiBase = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`

async function githubGetJson(endpoint) {
  const response = await fetch(`${apiBase}${endpoint}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'mlog-content-pull'
    },
    cache: 'no-store'
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`[content:pull] request failed ${response.status} ${endpoint} ${text}`)
  }

  return response.json()
}

async function readRepoTree() {
  const branchData = await githubGetJson(`/branches/${encodeURIComponent(baseBranch)}`)
  const commitSha = branchData?.commit?.sha
  if (!commitSha) {
    throw new Error('[content:pull] cannot resolve base branch sha')
  }

  const commit = await githubGetJson(`/git/commits/${encodeURIComponent(commitSha)}`)
  const treeSha = commit?.tree?.sha
  if (!treeSha) {
    throw new Error('[content:pull] cannot resolve tree sha')
  }

  const tree = await githubGetJson(`/git/trees/${encodeURIComponent(treeSha)}?recursive=1`)
  const items = Array.isArray(tree?.tree) ? tree.tree : []

  return items
    .filter(item => item?.type === 'blob' && typeof item.path === 'string')
    .map(item => item.path)
    .filter(pathInRepo => includePrefixes.some(prefix => pathInRepo.startsWith(prefix)))
}

async function fetchFileContent(pathInRepo) {
  const encodedPath = pathInRepo
    .split('/')
    .filter(Boolean)
    .map(segment => encodeURIComponent(segment))
    .join('/')

  const file = await githubGetJson(`/contents/${encodedPath}?ref=${encodeURIComponent(baseBranch)}`)
  if (!file || file.type !== 'file') {
    throw new Error(`[content:pull] path is not a file: ${pathInRepo}`)
  }

  const content = Buffer.from(String(file.content || '').replace(/\n/g, ''), 'base64').toString('utf8')
  return content
}

async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}

async function listLocalFiles(rootPath) {
  try {
    const entries = await fs.readdir(rootPath, { withFileTypes: true })
    const files = []
    for (const entry of entries) {
      const abs = path.join(rootPath, entry.name)
      if (entry.isDirectory()) {
        files.push(...(await listLocalFiles(abs)))
      } else {
        files.push(abs)
      }
    }
    return files
  } catch {
    return []
  }
}

async function removeStaleFiles(keptRepoPaths) {
  const keptAbsPaths = new Set(keptRepoPaths.map(repoPath => path.join(process.cwd(), repoPath)))
  const localRoots = ['content/posts', 'content/system', 'public/images/uploads']

  for (const root of localRoots) {
    const absRoot = path.join(process.cwd(), root)
    const files = await listLocalFiles(absRoot)
    for (const file of files) {
      if (!keptAbsPaths.has(file)) {
        await fs.unlink(file)
      }
    }
  }
}

async function main() {
  const repoPaths = await readRepoTree()
  await removeStaleFiles(repoPaths)

  for (const repoPath of repoPaths) {
    const absPath = path.join(process.cwd(), repoPath)
    const content = await fetchFileContent(repoPath)
    await ensureParentDir(absPath)
    await fs.writeFile(absPath, content, 'utf8')
  }

  console.log(`[content:pull] synced ${repoPaths.length} files from ${owner}/${repo}@${baseBranch}`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
