import 'server-only'
import { isIP } from 'node:net'
import { MediaError, mediaConfigError } from './errors'

export type MediaImageLimits = {
  maxInputBytes: number
  maxOutputBytes: number
  maxWidth: number
  maxHeight: number
  maxPixelsPerFrame: number
  maxTotalPixels: number
  maxFrames: number
}

export type MediaConfig = {
  github: {
    owner: string
    repo: string
    branch: string
    token: string
  }
  pathPrefix: string
  cdnBaseUrl?: string
  requestTimeoutMs: number
  maxRetries: number
  maxRepositoryBytes?: number
  rotationThreshold: number
  repoPrefix: string
  limits: MediaImageLimits
}

export const DEFAULT_MEDIA_LIMITS: MediaImageLimits = {
  // Vercel Functions reject request bodies around 4.5MB before route code runs.
  maxInputBytes: 4 * 1024 * 1024,
  maxOutputBytes: 4 * 1024 * 1024,
  maxWidth: 10_000,
  maxHeight: 10_000,
  maxPixelsPerFrame: 32_000_000,
  maxTotalPixels: 48_000_000,
  maxFrames: 120
}

export const DEFAULT_MAX_REPOSITORY_BYTES = Math.floor(3.5 * 1024 * 1024 * 1024)

export const DEFAULT_ROTATION_THRESHOLD = 0.9
export const DEFAULT_REPO_PREFIX = 'mlog-images'

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/
const PATH_SEGMENT_RE = /^[A-Za-z0-9._-]+$/

type MediaEnv = Record<string, string | undefined>

function requiredValue(env: MediaEnv, name: string): string {
  const rawValue = env[name]
  const value = rawValue?.trim()
  if (!value) {
    throw mediaConfigError(`Missing required media environment variable: ${name}.`)
  }
  if (rawValue !== value || /\s/.test(value)) {
    throw mediaConfigError(`Invalid whitespace in media environment variable: ${name}.`)
  }
  return value
}

function validateBranch(value: string): string {
  const branch = value.replace(/^refs\/heads\//, '')
  const invalid = branch.length > 255
    || !branch
    || branch.startsWith('.')
    || branch.startsWith('/')
    || branch.endsWith('.')
    || branch.endsWith('/')
    || branch.endsWith('.lock')
    || branch.includes('..')
    || branch.includes('//')
    || branch.includes('@{')
    || /[\u0000-\u0020~^:?*\\\[\]]/.test(branch)
  if (invalid) {
    throw mediaConfigError('IMAGE_GITHUB_BRANCH is not a valid Git reference name.')
  }
  return branch
}

export function normalizeMediaPathPrefix(input: string | undefined): string {
  const value = (input || 'uploads/blog').trim().replace(/^\/+|\/+$/g, '')
  const segments = value.split('/')
  if (
    !value
    || value.length > 180
    || segments.some(segment => !PATH_SEGMENT_RE.test(segment) || segment === '.' || segment === '..')
  ) {
    throw mediaConfigError('IMAGE_GITHUB_PATH_PREFIX must be a safe relative repository path.')
  }
  return segments.join('/')
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (
    normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized.endsWith('.local')
    || normalized.endsWith('.internal')
    || normalized.endsWith('.home.arpa')
  ) {
    return true
  }

  const ipVersion = isIP(normalized)
  // A CDN configured by hostname can be allowlisted; literal IP origins are never needed here
  // and make server-side availability probes easier to misroute into private infrastructure.
  if (ipVersion !== 0) return true
  return false
}

function normalizeCdnBaseUrl(input: string | undefined): string | undefined {
  const value = input?.trim()
  if (!value) return undefined

  if (/(?:^|\/)(?:\.{1,2})(?:\/|$)/.test(value) || /%(?:2e|2f|5c)/i.test(value)) {
    throw mediaConfigError('NEXT_PUBLIC_CDN_BASE_URL must not contain path traversal segments.')
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw mediaConfigError('NEXT_PUBLIC_CDN_BASE_URL must be a valid HTTPS URL.')
  }

  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.search
    || url.hash
    || (url.port && url.port !== '443')
    || isPrivateHostname(url.hostname)
    || url.pathname.split('/').some(segment => segment === '..')
  ) {
    throw mediaConfigError('NEXT_PUBLIC_CDN_BASE_URL must be a public HTTPS origin or path without credentials, query, or fragment.')
  }

  return url.toString().replace(/\/$/, '')
}

export function readMediaConfig(env: MediaEnv = process.env): MediaConfig {
  // IMAGE_GITHUB_* is preferred; fall back to CONTENT_GITHUB_* for zero-config.
  const owner = (env.IMAGE_GITHUB_OWNER || env.CONTENT_GITHUB_OWNER || '').trim()
  const token = (env.IMAGE_GITHUB_TOKEN || env.CONTENT_GITHUB_WRITE_TOKEN || '').trim()
  const repo = (env.IMAGE_GITHUB_REPO || '').trim()

  if (owner && !OWNER_RE.test(owner)) {
    throw mediaConfigError('IMAGE_GITHUB_OWNER is invalid.')
  }
  if (repo && (!REPO_RE.test(repo) || repo === '.' || repo === '..')) {
    throw mediaConfigError('IMAGE_GITHUB_REPO is invalid.')
  }
  const configuredMaxBytes = Number(env.IMAGE_GITHUB_MAX_REPOSITORY_BYTES || DEFAULT_MAX_REPOSITORY_BYTES)
  if (!Number.isSafeInteger(configuredMaxBytes) || configuredMaxBytes < 100 * 1024 * 1024 || configuredMaxBytes > 4 * 1024 * 1024 * 1024) {
    throw mediaConfigError('IMAGE_GITHUB_MAX_REPOSITORY_BYTES must be an integer between 100MB and 4GB.')
  }

  return {
    github: {
      owner,
      repo,
      branch: validateBranch(env.IMAGE_GITHUB_BRANCH?.trim() || 'main'),
      token
    },
    pathPrefix: normalizeMediaPathPrefix(env.IMAGE_GITHUB_PATH_PREFIX),
    cdnBaseUrl: normalizeCdnBaseUrl(env.NEXT_PUBLIC_CDN_BASE_URL),
    requestTimeoutMs: 8_000,
    maxRetries: 2,
    maxRepositoryBytes: configuredMaxBytes,
    rotationThreshold: Number(env.IMAGE_GITHUB_ROTATION_THRESHOLD || DEFAULT_ROTATION_THRESHOLD),
    repoPrefix: (env.IMAGE_GITHUB_REPO_PREFIX || DEFAULT_REPO_PREFIX).trim(),
    limits: { ...DEFAULT_MEDIA_LIMITS }
  }
}

export function assertMediaObjectPath(path: string, prefix: string): void {
  const segments = path.split('/')
  if (
    !path
    || path.length > 400
    || !path.startsWith(`${prefix}/`)
    || segments.some(segment => !PATH_SEGMENT_RE.test(segment) || segment === '.' || segment === '..')
  ) {
    throw new MediaError({
      status: 400,
      code: 'MEDIA_INVALID_INPUT',
      message: 'Media object path is outside the configured storage prefix.'
    })
  }
}
