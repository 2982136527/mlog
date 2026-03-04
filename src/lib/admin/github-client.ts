import { createHash } from 'node:crypto'
import { getAdminGithubEnv } from '@/lib/admin/env'
import { AdminHttpError } from '@/lib/admin/errors'

const API_BASE = 'https://api.github.com'

type GitHubRefResponse = {
  object: {
    sha: string
  }
}

type GitHubBranchResponse = {
  commit: {
    sha: string
  }
}

type GitHubCommitResponse = {
  tree: {
    sha: string
  }
}

type GitHubTreeResponse = {
  tree: Array<{
    path: string
    mode: string
    type: 'blob' | 'tree' | 'commit'
    sha: string
  }>
}

type GitHubContentResponse = {
  type: 'file' | 'dir'
  sha: string
  name: string
  path: string
  content?: string
  encoding?: string
}

type GitHubPullResponse = {
  number: number
  html_url: string
}

type GitHubMergeResponse = {
  merged: boolean
  message: string
}

type RequestOptions = {
  method?: string
  body?: Record<string, unknown>
  allowStatuses?: number[]
}

function encodeSegments(input: string): string {
  return input
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')
}

async function githubRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<{ data: T; status: number }> {
  const { owner, repo, token } = getAdminGithubEnv()
  const url = `${API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${endpoint}`

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store'
  })

  const allowed = options.allowStatuses || []
  const text = await response.text()
  const parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {}

  if (!response.ok && !allowed.includes(response.status)) {
    const message = typeof parsed.message === 'string' ? parsed.message : `GitHub API request failed (${response.status})`
    throw new AdminHttpError(response.status, 'GITHUB_API_ERROR', message)
  }

  return {
    data: parsed as T,
    status: response.status
  }
}

function decodeBase64(content: string): string {
  return Buffer.from(content.replace(/\n/g, ''), 'base64').toString('utf8')
}

export function encodeTextBase64(content: string): string {
  return Buffer.from(content, 'utf8').toString('base64')
}

export function encodeBufferBase64(buffer: Buffer): string {
  return buffer.toString('base64')
}

export function hashBuffer(buffer: Buffer): string {
  return createHash('sha1').update(buffer).digest('hex').slice(0, 10)
}

export async function getBranchHeadSha(branch: string): Promise<string> {
  try {
    const { data } = await githubRequest<GitHubRefResponse>(`/git/ref/heads/${encodeSegments(branch)}`)
    return data.object.sha
  } catch (error) {
    if (!(error instanceof AdminHttpError) || error.status !== 404) {
      throw error
    }

    // Fallback for repositories that do not resolve the ref endpoint as expected.
    const { data } = await githubRequest<GitHubBranchResponse>(`/branches/${encodeSegments(branch)}`)
    return data.commit.sha
  }
}

export async function createBranch(branch: string): Promise<void> {
  const { baseBranch } = getAdminGithubEnv()
  const baseSha = await getBranchHeadSha(baseBranch)

  await githubRequest('/git/refs', {
    method: 'POST',
    body: {
      ref: `refs/heads/${branch}`,
      sha: baseSha
    }
  })
}

export async function getRepoTextFile(path: string, ref?: string): Promise<{ path: string; sha: string; content: string } | null> {
  const branch = ref || getAdminGithubEnv().baseBranch
  const endpoint = `/contents/${encodeSegments(path)}?ref=${encodeURIComponent(branch)}`
  const { data, status } = await githubRequest<GitHubContentResponse | GitHubContentResponse[]>(endpoint, {
    allowStatuses: [404]
  })

  if (status === 404) {
    return null
  }

  if (Array.isArray(data) || data.type !== 'file') {
    throw new AdminHttpError(400, 'INVALID_FILE_TARGET', `Path is not a file: ${path}`)
  }

  return {
    path: data.path,
    sha: data.sha,
    content: decodeBase64(data.content || '')
  }
}

export async function upsertFile(params: {
  path: string
  contentBase64: string
  branch: string
  message: string
  sha?: string
}): Promise<void> {
  await githubRequest(`/contents/${encodeSegments(params.path)}`, {
    method: 'PUT',
    body: {
      message: params.message,
      content: params.contentBase64,
      branch: params.branch,
      ...(params.sha ? { sha: params.sha } : {})
    }
  })
}

export async function deleteFile(params: {
  path: string
  branch: string
  sha: string
  message: string
}): Promise<void> {
  await githubRequest(`/contents/${encodeSegments(params.path)}`, {
    method: 'DELETE',
    body: {
      message: params.message,
      branch: params.branch,
      sha: params.sha
    }
  })
}

export async function createPullRequest(params: {
  title: string
  body: string
  head: string
  base: string
}): Promise<GitHubPullResponse> {
  const { data } = await githubRequest<GitHubPullResponse>('/pulls', {
    method: 'POST',
    body: {
      title: params.title,
      body: params.body,
      head: params.head,
      base: params.base
    }
  })

  return data
}

export async function mergePullRequest(prNumber: number): Promise<GitHubMergeResponse> {
  const { data } = await githubRequest<GitHubMergeResponse>(`/pulls/${prNumber}/merge`, {
    method: 'PUT',
    body: {
      merge_method: 'squash'
    },
    allowStatuses: [405, 409]
  })

  return {
    merged: Boolean(data.merged),
    message: typeof data.message === 'string' ? data.message : 'merge failed'
  }
}

export async function listContentMarkdownPaths(branch?: string): Promise<string[]> {
  const targetBranch = branch || getAdminGithubEnv().baseBranch
  const refSha = await getBranchHeadSha(targetBranch)

  const { data: commit } = await githubRequest<GitHubCommitResponse>(`/git/commits/${encodeURIComponent(refSha)}`)
  const treeSha = commit.tree.sha

  const { data: tree } = await githubRequest<GitHubTreeResponse>(`/git/trees/${encodeURIComponent(treeSha)}?recursive=1`)

  return tree.tree
    .filter(item => item.type === 'blob')
    .map(item => item.path)
    .filter(path => /^content\/posts\/[^/]+\/(zh|en)\.md$/.test(path))
    .sort((a, b) => a.localeCompare(b))
}

export function buildBranchName(action: 'create' | 'update' | 'delete' | 'media' | 'automation', slug: string): string {
  const stamp = Date.now().toString().slice(-8)
  const safeSlug = slug.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-') || 'post'
  return `admin/${action}/${safeSlug}-${stamp}`
}
