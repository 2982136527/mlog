export type GithubRepoEnv = {
  owner: string
  repo: string
  baseBranch: string
  token: string
}

export type AdminGithubEnv = GithubRepoEnv & {
  autoMerge: boolean
}

function trimEnv(value: string | undefined): string {
  return (value || '').trim()
}

function normalizeBranch(value: string): string {
  const trimmed = value.trim()
  const withoutPrefix = trimmed.replace(/^refs\/heads\//, '')
  return withoutPrefix || 'main'
}

function readRepoEnv(input: {
  owner: string | undefined
  repo: string | undefined
  baseBranch: string | undefined
  token: string | undefined
  label: string
}): GithubRepoEnv {
  const owner = trimEnv(input.owner)
  const repo = trimEnv(input.repo)
  const baseBranch = normalizeBranch(input.baseBranch || 'main')
  const token = trimEnv(input.token)

  if (!owner || !repo || !token) {
    throw new Error(`Missing ${input.label} GitHub env vars: owner/repo/token are required.`)
  }

  return {
    owner,
    repo,
    baseBranch,
    token
  }
}

export function getContentGithubWriteEnv(): GithubRepoEnv {
  return readRepoEnv({
    owner: process.env.CONTENT_GITHUB_OWNER || process.env.GITHUB_OWNER,
    repo: process.env.CONTENT_GITHUB_REPO || process.env.GITHUB_REPO,
    baseBranch: process.env.CONTENT_GITHUB_BASE_BRANCH || process.env.GITHUB_BASE_BRANCH || 'main',
    token: process.env.CONTENT_GITHUB_WRITE_TOKEN || process.env.GITHUB_WRITE_TOKEN,
    label: 'content(write)'
  })
}

export function getContentGithubReadEnv(): GithubRepoEnv {
  return readRepoEnv({
    owner: process.env.CONTENT_GITHUB_OWNER || process.env.GITHUB_OWNER,
    repo: process.env.CONTENT_GITHUB_REPO || process.env.GITHUB_REPO,
    baseBranch: process.env.CONTENT_GITHUB_BASE_BRANCH || process.env.GITHUB_BASE_BRANCH || 'main',
    token: process.env.CONTENT_GITHUB_READ_TOKEN || process.env.CONTENT_GITHUB_WRITE_TOKEN || process.env.GITHUB_WRITE_TOKEN,
    label: 'content(read)'
  })
}

export function getPublicGithubWriteEnv(): GithubRepoEnv {
  return readRepoEnv({
    owner: process.env.PUBLIC_GITHUB_OWNER || process.env.GITHUB_OWNER || process.env.CONTENT_GITHUB_OWNER,
    repo: process.env.PUBLIC_GITHUB_REPO || process.env.GITHUB_REPO || process.env.CONTENT_GITHUB_REPO,
    baseBranch: process.env.PUBLIC_GITHUB_BASE_BRANCH || process.env.GITHUB_BASE_BRANCH || process.env.CONTENT_GITHUB_BASE_BRANCH || 'main',
    token: process.env.PUBLIC_GITHUB_WRITE_TOKEN || process.env.GITHUB_WRITE_TOKEN || process.env.CONTENT_GITHUB_WRITE_TOKEN,
    label: 'public(write)'
  })
}

export function getAdminGithubEnv(): AdminGithubEnv {
  const repoEnv = getContentGithubWriteEnv()
  const autoMerge = trimEnv(process.env.ADMIN_AUTO_MERGE || 'true').toLowerCase() !== 'false'

  return {
    ...repoEnv,
    autoMerge
  }
}
