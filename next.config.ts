import type { NextConfig } from 'next'

type RemotePattern = NonNullable<NonNullable<NextConfig['images']>['remotePatterns']>[number]

export function mediaRemotePatterns(): RemotePattern[] {
  const patterns: RemotePattern[] = []
  const owner = (process.env.IMAGE_GITHUB_OWNER || '').trim()
  const repo = (process.env.IMAGE_GITHUB_REPO || '').trim()
  const branch = (process.env.IMAGE_GITHUB_BRANCH || 'main').trim().replace(/^refs\/heads\//, '')
  const repositories = Array.from(new Set([
    repo,
    ...(process.env.IMAGE_GITHUB_REPO_HISTORY || '').split(',').map(value => value.trim())
  ].filter(value => /^[A-Za-z0-9._-]+$/.test(value))))

  if (/^[A-Za-z0-9-]+$/.test(owner) && repositories.length > 0 && branch) {
    const encodedBranch = encodeURIComponent(branch)
    for (const repository of repositories) {
      patterns.push(
        {
          protocol: 'https',
          hostname: 'raw.githubusercontent.com',
          pathname: `/${owner}/${repository}/${encodedBranch}/**`
        },
        {
          protocol: 'https',
          hostname: 'cdn.jsdelivr.net',
          pathname: `/gh/${owner}/${repository}@${encodedBranch}/**`
        }
      )
    }
  }

  const cdnValue = (process.env.NEXT_PUBLIC_CDN_BASE_URL || '').trim()
  if (cdnValue) {
    try {
      const cdn = new URL(cdnValue)
      if (cdn.protocol === 'https:') {
        patterns.push({
          protocol: 'https',
          hostname: cdn.hostname,
          port: cdn.port,
          pathname: `${cdn.pathname.replace(/\/$/, '') || ''}/**`
        })
      }
    } catch {
      // Media configuration validation reports the actionable error at runtime.
    }
  }

  return patterns
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: mediaRemotePatterns()
  }
}

export default nextConfig
