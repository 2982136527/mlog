const GITHUB_OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/
const GITHUB_REPO_RE = /^[A-Za-z0-9._-]{1,100}$/

function configuredRepositories(): Array<{ owner: string; repo: string; branch: string }> {
  const owner = (process.env.IMAGE_GITHUB_OWNER || '').trim()
  const repo = (process.env.IMAGE_GITHUB_REPO || '').trim()
  const branch = (process.env.IMAGE_GITHUB_BRANCH || 'main').trim().replace(/^refs\/heads\//, '')

  if (!GITHUB_OWNER_RE.test(owner) || !GITHUB_REPO_RE.test(repo) || !branch) {
    return []
  }

  const repositories = new Set([
    repo,
    ...(process.env.IMAGE_GITHUB_REPO_HISTORY || '').split(',').map(value => value.trim()).filter(value => GITHUB_REPO_RE.test(value))
  ])
  return Array.from(repositories, repository => ({ owner, repo: repository, branch }))
}

function configuredCdn(): URL | null {
  const value = (process.env.NEXT_PUBLIC_CDN_BASE_URL || '').trim()
  if (!value) return null

  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

function isPathWithin(pathname: string, prefix: string): boolean {
  const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`
  return pathname === prefix || pathname.startsWith(normalizedPrefix)
}

export function isAllowedPublicMediaUrl(value: string | null | undefined): boolean {
  const source = value?.trim()
  if (!source) return false

  if (source.startsWith('/')) {
    try {
      const local = new URL(source, 'https://mlog.local')
      const decodedPath = decodeURIComponent(local.pathname)
      return local.origin === 'https://mlog.local'
        && local.pathname.startsWith('/images/')
        && !decodedPath.split('/').includes('..')
    } catch {
      return false
    }
  }

  let url: URL
  try {
    url = new URL(source)
  } catch {
    return false
  }

  if (url.protocol !== 'https:' || url.username || url.password) {
    return false
  }

  for (const repository of configuredRepositories()) {
    const encodedBranch = encodeURIComponent(repository.branch)
    const rawPrefix = `/${repository.owner}/${repository.repo}/${encodedBranch}`
    if (url.hostname === 'raw.githubusercontent.com' && isPathWithin(url.pathname, rawPrefix)) {
      return true
    }

    const jsdelivrPrefix = `/gh/${repository.owner}/${repository.repo}@${encodedBranch}`
    if (url.hostname === 'cdn.jsdelivr.net' && isPathWithin(url.pathname, jsdelivrPrefix)) {
      return true
    }
  }

  const cdn = configuredCdn()
  return Boolean(
    cdn
    && url.origin === cdn.origin
    && isPathWithin(url.pathname, cdn.pathname.replace(/\/$/, '') || '/')
  )
}

export function toAbsolutePublicMediaUrl(value: string | null | undefined, siteUrl: string): string | undefined {
  if (!isAllowedPublicMediaUrl(value)) return undefined
  const source = value!.trim()
  return source.startsWith('/') ? new URL(source, siteUrl).toString() : source
}
