#!/usr/bin/env node

import nextEnv from '@next/env'
const { loadEnvConfig } = nextEnv
loadEnvConfig(process.cwd(), false)

const GITHUB_API = 'https://api.github.com'
const RAW_BASE = 'https://raw.githubusercontent.com'
const OWNER = process.env.CONTENT_GITHUB_OWNER?.trim()
const PRIMARY_REPO = process.env.CONTENT_GITHUB_REPO?.trim()
const BRANCH = (process.env.CONTENT_GITHUB_BASE_BRANCH || 'main').trim().replace(/^refs\/heads\//, '')
const TOKEN = process.env.CONTENT_GITHUB_WRITE_TOKEN?.trim()
const SHARD_PREFIX = (process.env.CONTENT_GITHUB_SHARD_REPO_PREFIX || PRIMARY_REPO).trim()
const BATCH_SIZE = 50
const RATE_LIMIT_PAUSE_MS = 3_000

const SHARD_REGISTRY_PATH = 'content/system/shards.json'
const POST_FILE_RE = /^content\/posts\/([a-z0-9-]+)\/(zh|en)\.md$/

if (!OWNER || !PRIMARY_REPO || !TOKEN) {
  console.error('Missing GitHub env vars')
  process.exit(1)
}

async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'mlog-migration',
      ...opts.headers
    },
    ...opts
  })
  if (!res.ok) {
    if (res.status === 403) {
      const text = await res.text()
      if (text.includes('rate limit')) {
        console.log('  Rate limited, waiting 30s...')
        await new Promise(r => setTimeout(r, 30_000))
        return api(url, opts)
      }
      throw new Error(`GitHub API ${res.status}: ${text.slice(0, 200)}`)
    }
    const text = await res.text()
    throw new Error(`GitHub API ${res.status}: ${url} - ${text.slice(0, 200)}`)
  }
  return res.json()
}

async function getCommitSha(repo) {
  const ref = await api(`${GITHUB_API}/repos/${OWNER}/${repo}/git/ref/heads/${BRANCH}`)
  return ref.object.sha
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function migrate() {
  console.log(`Migrating fiction posts in ${OWNER}/${PRIMARY_REPO}...`)
  
  const primarySha = await getCommitSha(PRIMARY_REPO)
  const commit = await api(`${GITHUB_API}/repos/${OWNER}/${PRIMARY_REPO}/git/commits/${primarySha}`)
  const tree = await api(`${GITHUB_API}/repos/${OWNER}/${PRIMARY_REPO}/git/trees/${commit.tree.sha}?recursive=1`)
  
  if (tree.truncated) throw new Error('Tree truncated!')
  
  const regEntry = tree.tree.find(e => e.path === SHARD_REGISTRY_PATH)
  let repos = [PRIMARY_REPO]
  if (regEntry) {
    const rawReg = await fetch(`${RAW_BASE}/${OWNER}/${PRIMARY_REPO}/${primarySha}/${SHARD_REGISTRY_PATH}`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    })
    if (rawReg.ok) {
      const reg = await rawReg.json()
      if (Array.isArray(reg.shards)) {
        const seen = new Set([PRIMARY_REPO.toLowerCase()])
        for (const s of reg.shards) {
          if (typeof s.repo === 'string' && !seen.has(s.repo.toLowerCase())) {
            seen.add(s.repo.toLowerCase())
            repos.push(s.repo)
          }
        }
      }
    }
  }
  console.log(`Repos: ${repos.join(', ')}`)
  
  const oldCategories = ['短篇小说', 'Fiction']
  const updates = []
  
  for (const repo of repos) {
    const sha = await getCommitSha(repo)
    const repoCommit = await api(`${GITHUB_API}/repos/${OWNER}/${repo}/git/commits/${sha}`)
    const repoTree = await api(`${GITHUB_API}/repos/${OWNER}/${repo}/git/trees/${repoCommit.tree.sha}?recursive=1`)
    
    const postFiles = repoTree.tree.filter(e => e.type === 'blob' && POST_FILE_RE.test(e.path))
    console.log(`  ${repo}: ${postFiles.length} files`)
    
    for (const file of postFiles) {
      const raw = await fetch(`${RAW_BASE}/${OWNER}/${repo}/${sha}/${file.path}`, {
        headers: { Authorization: `Bearer ${TOKEN}` }
      })
      if (!raw.ok) continue
      const content = await raw.text()
      
      let updated = content
      let changed = false
      
      for (const oldCat of oldCategories) {
        const escaped = oldCat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const re = new RegExp(`^(category:\\s*)["']?${escaped}["']?\\s*$`, 'm')
        if (re.test(updated)) {
          updated = updated.replace(re, `category: "小说"`)
          changed = true
        }
      }
      
      if (changed) {
        updates.push({ repo, path: file.path, sha: file.sha, newContent: updated })
      }
    }
  }
  
  if (updates.length === 0) {
    console.log('No posts need migration.')
    return
  }
  
  console.log(`\n${updates.length} files to update. Processing in batches of ${BATCH_SIZE}...`)
  
  const repoUpdatesMap = new Map()
  for (const u of updates) {
    if (!repoUpdatesMap.has(u.repo)) repoUpdatesMap.set(u.repo, [])
    repoUpdatesMap.get(u.repo).push(u)
  }
  
  const branchName = `migrate/fic-category-${Date.now()}`
  
  for (const [repo, repoUpdates] of repoUpdatesMap) {
    console.log(`\nProcessing ${repo}: ${repoUpdates.length} files...`)
    
    const repoSha = await getCommitSha(repo)
    const repoBaseTreeSha = (await api(`${GITHUB_API}/repos/${OWNER}/${repo}/git/commits/${repoSha}`)).tree.sha
    
    // Batch blob creation
    const allBlobs = []
    for (let i = 0; i < repoUpdates.length; i += BATCH_SIZE) {
      const batch = repoUpdates.slice(i, i + BATCH_SIZE)
      console.log(`  Creating blobs batch ${Math.floor(i/BATCH_SIZE)+1}/${Math.ceil(repoUpdates.length/BATCH_SIZE)}...`)
      
      const blobResults = await Promise.allSettled(
        batch.map(u => 
          api(`${GITHUB_API}/repos/${OWNER}/${repo}/git/blobs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: u.newContent, encoding: 'utf-8' })
          })
        )
      )
      
      for (let j = 0; j < blobResults.length; j++) {
        const r = blobResults[j]
        if (r.status === 'fulfilled') {
          allBlobs.push({ path: batch[j].path, sha: r.value.sha })
        } else {
          console.error(`  Failed blob for ${batch[j].path}: ${r.reason}`)
        }
      }
      
      if (i + BATCH_SIZE < repoUpdates.length) {
        await sleep(RATE_LIMIT_PAUSE_MS)
      }
    }
    
    console.log(`  Created ${allBlobs.length} blobs, creating tree...`)
    
    // Create tree with all new blobs
    const newTree = await api(`${GITHUB_API}/repos/${OWNER}/${repo}/git/trees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_tree: repoBaseTreeSha,
        tree: allBlobs.map(b => ({ path: b.path, mode: '100644', type: 'blob', sha: b.sha }))
      })
    })
    
    console.log('  Creating commit...')
    const commitObj = await api(`${GITHUB_API}/repos/${OWNER}/${repo}/git/commits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `migrate: update fiction category from 短篇小说/Fiction to 小说`,
        tree: newTree.sha,
        parents: [repoSha]
      })
    })
    
    console.log('  Creating branch...')
    try {
      await api(`${GITHUB_API}/repos/${OWNER}/${repo}/git/refs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ref: `refs/heads/${branchName}`,
          sha: commitObj.sha
        })
      })
    } catch (e) {
      // Branch might already exist from a previous run
      console.log(`  Branch creation: ${e.message}`)
    }
    
    console.log('  Creating PR...')
    const pr = await api(`${GITHUB_API}/repos/${OWNER}/${repo}/pulls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `迁移：小说分类统一改为「小说」`,
        head: branchName,
        base: BRANCH,
        body: `将 ${repoUpdates.length} 篇小说的 category 从「短篇小说」/「Fiction」统一改为「小说」。\n\n影响文件：${repoUpdates.length} 个`
      })
    })
    console.log(`  PR #${pr.number}: ${pr.html_url}`)
    
    console.log('  Merging PR...')
    const merge = await api(`${GITHUB_API}/repos/${OWNER}/${repo}/pulls/${pr.number}/merge`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commit_title: `迁移：小说分类统一改为「小说」` })
    })
    console.log(`  Merged: ${merge.merged ? 'OK' : 'FAIL'} ${merge.message}`)
    
    await sleep(2_000)
  }
  
  console.log('\nMigration complete!')
}

migrate().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
