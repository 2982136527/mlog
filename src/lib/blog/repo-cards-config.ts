import 'server-only'
import fs from 'node:fs'
import path from 'node:path'
import { cache } from 'react'
import { z } from 'zod'
import { slugSchema } from '@/lib/content/schema'
import type { AdminRepoCardsInput, RepoCardsConfig } from '@/types/repo-cards'

const CONTENT_ROOT = path.join(process.cwd(), 'content', 'posts')
const GITHUB_REPO_IN_TEXT_RE = /https:\/\/github\.com\/[^\s<)"'`\\]+/gi

const repoCardsConfigSchema = z.object({
  enabled: z.boolean(),
  repoUrl: z.string().trim(),
  repoFullName: z.string().trim().nullable(),
  staticSnapshot: z
    .object({
      stars: z.number().int().min(0),
      forks: z.number().int().min(0),
      openIssues: z.number().int().min(0),
      snapshotAt: z.string().trim(),
      language: z.string().trim().nullable(),
      license: z.string().trim().nullable(),
      pushedAt: z.string().trim().nullable(),
      updatedAt: z.string().trim().nullable()
    })
    .nullable(),
  updatedAt: z.string().trim(),
  updatedBy: z.enum(['admin', 'system'])
})

function toIsoNow(): string {
  return new Date().toISOString()
}

function toIsoOrNow(input: string | undefined): string {
  const value = (input || '').trim()
  const date = value ? new Date(value) : null
  if (date && !Number.isNaN(date.getTime())) {
    return date.toISOString()
  }
  return toIsoNow()
}

function sanitizeRepoSegment(value: string): string {
  let decoded = value.trim()
  try {
    decoded = decodeURIComponent(decoded)
  } catch {
    decoded = value.trim()
  }

  return decoded
    .replace(/%60$/i, '')
    .replace(/`+$/, '')
    .replace(/\\+$/, '')
    .replace(/\.git$/i, '')
    .replace(/[.,;:!?]+$/, '')
}

export function buildDefaultRepoCardsConfig(): RepoCardsConfig {
  return {
    enabled: false,
    repoUrl: '',
    repoFullName: null,
    staticSnapshot: null,
    updatedAt: toIsoNow(),
    updatedBy: 'admin'
  }
}

export function buildRepoCardsPath(slugInput: string): string {
  const slug = slugSchema.parse(slugInput)
  return `content/posts/${slug}/repo-cards.json`
}

export function parseGithubRepoUrl(input: string): { owner: string; repo: string; fullName: string; normalizedUrl: string } {
  const value = input.trim()
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('repoUrl must be a valid GitHub repository URL like https://github.com/owner/repo')
  }

  const host = url.hostname.toLowerCase()
  if (url.protocol !== 'https:' || (host !== 'github.com' && host !== 'www.github.com')) {
    throw new Error('repoUrl must be a valid GitHub repository URL like https://github.com/owner/repo')
  }

  const segments = url.pathname.split('/').filter(Boolean)
  const owner = sanitizeRepoSegment(segments[0] || '')
  const repo = sanitizeRepoSegment(segments[1] || '')
  if (!owner || !repo) {
    throw new Error('repoUrl must include owner and repository name')
  }

  return {
    owner,
    repo,
    fullName: `${owner}/${repo}`,
    normalizedUrl: `https://github.com/${owner}/${repo}`
  }
}

export function extractGithubRepoFromMarkdown(markdown: string): { owner: string; repo: string; fullName: string; normalizedUrl: string } | null {
  for (const matched of markdown.matchAll(GITHUB_REPO_IN_TEXT_RE)) {
    const candidate = (matched[0] || '').replace(/[.,;:!?]+$/, '')
    if (!candidate) {
      continue
    }

    try {
      return parseGithubRepoUrl(candidate)
    } catch {
      continue
    }
  }

  return null
}

export function normalizeAdminRepoCardsInput(input?: AdminRepoCardsInput): AdminRepoCardsInput | undefined {
  if (!input) {
    return undefined
  }

  return {
    enabled: Boolean(input.enabled),
    repoUrl: (input.repoUrl || '').trim()
  }
}

export function parseRepoCardsConfig(raw: string): RepoCardsConfig {
  const parsed = JSON.parse(raw) as unknown
  const validated = repoCardsConfigSchema.parse(parsed)

  return {
    enabled: validated.enabled,
    repoUrl: validated.repoUrl,
    repoFullName: validated.repoFullName,
    staticSnapshot: validated.staticSnapshot
      ? {
          ...validated.staticSnapshot,
          snapshotAt: toIsoOrNow(validated.staticSnapshot.snapshotAt),
          pushedAt: validated.staticSnapshot.pushedAt || null,
          updatedAt: validated.staticSnapshot.updatedAt || null,
          language: validated.staticSnapshot.language || null,
          license: validated.staticSnapshot.license || null
        }
      : null,
    updatedAt: toIsoOrNow(validated.updatedAt),
    updatedBy: validated.updatedBy
  }
}

export function parseRepoCardsConfigOrDefault(raw?: string | null): RepoCardsConfig {
  if (!raw) {
    return buildDefaultRepoCardsConfig()
  }

  try {
    return parseRepoCardsConfig(raw)
  } catch {
    return buildDefaultRepoCardsConfig()
  }
}

export function serializeRepoCardsConfig(config: RepoCardsConfig): string {
  const payload = repoCardsConfigSchema.parse({
    ...config,
    updatedAt: toIsoOrNow(config.updatedAt),
    staticSnapshot: config.staticSnapshot
      ? {
          ...config.staticSnapshot,
          snapshotAt: toIsoOrNow(config.staticSnapshot.snapshotAt),
          pushedAt: config.staticSnapshot.pushedAt || null,
          updatedAt: config.staticSnapshot.updatedAt || null,
          language: config.staticSnapshot.language || null,
          license: config.staticSnapshot.license || null
        }
      : null
  })

  return `${JSON.stringify(payload, null, 2)}\n`
}

const getRepoCardsConfigFromLocalUnsafe = (slugInput: string): RepoCardsConfig => {
  const slug = slugSchema.parse(slugInput)
  const filePath = path.join(CONTENT_ROOT, slug, 'repo-cards.json')

  if (!fs.existsSync(filePath)) {
    return buildDefaultRepoCardsConfig()
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    return parseRepoCardsConfigOrDefault(raw)
  } catch {
    return buildDefaultRepoCardsConfig()
  }
}

export const getRepoCardsConfigFromLocal = cache((slugInput: string): RepoCardsConfig => {
  return getRepoCardsConfigFromLocalUnsafe(slugInput)
})
