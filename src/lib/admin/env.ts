export type AdminGithubEnv = {
  owner: string
  repo: string
  baseBranch: string
  token: string
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

export function getAdminGithubEnv(): AdminGithubEnv {
  const owner = trimEnv(process.env.GITHUB_OWNER)
  const repo = trimEnv(process.env.GITHUB_REPO)
  const baseBranch = normalizeBranch(process.env.GITHUB_BASE_BRANCH || 'main')
  const token = trimEnv(process.env.GITHUB_WRITE_TOKEN)
  const autoMerge = trimEnv(process.env.ADMIN_AUTO_MERGE || 'true').toLowerCase() !== 'false'

  if (!owner || !repo || !token) {
    throw new Error('Missing GitHub admin env vars: GITHUB_OWNER, GITHUB_REPO, GITHUB_WRITE_TOKEN are required.')
  }

  return {
    owner,
    repo,
    baseBranch,
    token,
    autoMerge
  }
}
