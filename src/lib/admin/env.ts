export type AdminGithubEnv = {
  owner: string
  repo: string
  baseBranch: string
  token: string
  autoMerge: boolean
}

export function getAdminGithubEnv(): AdminGithubEnv {
  const owner = process.env.GITHUB_OWNER || ''
  const repo = process.env.GITHUB_REPO || ''
  const baseBranch = process.env.GITHUB_BASE_BRANCH || 'main'
  const token = process.env.GITHUB_WRITE_TOKEN || ''
  const autoMerge = (process.env.ADMIN_AUTO_MERGE || 'true').toLowerCase() !== 'false'

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
