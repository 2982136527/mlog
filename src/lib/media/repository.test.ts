import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  statements: [] as Array<{ text: string; values: unknown[] }>,
  handler: vi.fn()
}))

vi.mock('@vercel/postgres', () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join(' ? ')
    db.statements.push({ text, values })
    return Promise.resolve(db.handler(text, values) || { rows: [] })
  }
}))

import {
  claimMediaProbeLease,
  markMediaFailed,
  saveUploadedMedia,
  toMediaDto,
  updateMediaAvailability,
  type StoredMediaAsset
} from './repository'
import type { MediaAsset, MediaProviderLocator } from './types'

const hash = 'a'.repeat(64)
const oldLocator: MediaProviderLocator = {
  owner: 'old-owner',
  repo: 'old-images',
  branch: 'main',
  pathPrefix: 'uploads/blog'
}
const newLocator: MediaProviderLocator = {
  owner: 'new-owner',
  repo: 'new-images',
  branch: 'media',
  pathPrefix: 'assets/mlog'
}

function row(input: {
  status?: StoredMediaAsset['status']
  locator?: MediaProviderLocator
  path?: string
  url?: string | null
  candidates?: Array<{ kind: 'custom-cdn' | 'jsdelivr' | 'github-raw'; url: string }>
  leaseToken?: string | null
  leaseExpiresAt?: string | null
  processingStartedAt?: string | null
} = {}) {
  const locator = input.locator || oldLocator
  const status = input.status || 'ready'
  return {
    id: hash,
    sha256: hash,
    storage_path: input.path || `${locator.pathPrefix}/aa/${hash}.png`,
    provider_owner: locator.owner,
    provider_repo: locator.repo,
    provider_branch: locator.branch,
    provider_path_prefix: locator.pathPrefix,
    mime_type: 'image/png',
    original_name: 'image.png',
    alt_text: 'image',
    size_bytes: 10,
    width: 1,
    height: 1,
    frames: 1,
    uploader_login: 'admin',
    status,
    public_url: input.url === undefined
      ? (status === 'ready' ? 'https://old.example.test/image.png' : null)
      : input.url,
    candidate_kind: status === 'ready' ? 'custom-cdn' : null,
    candidates: input.candidates || [{ kind: 'custom-cdn', url: 'https://old.example.test/image.png' }],
    availability_checked_at: '2026-07-13T00:00:00.000Z',
    processing_started_at: input.processingStartedAt === undefined
      ? (status === 'processing' ? '2026-07-13T00:00:00.000Z' : null)
      : input.processingStartedAt,
    probe_lease_token: input.leaseToken || null,
    probe_lease_expires_at: input.leaseExpiresAt || null,
    error_code: status === 'failed' ? 'MEDIA_PROCESSING_TIMEOUT' : null,
    error_message: status === 'failed' ? 'timed out' : null,
    created_at: '2026-07-13T00:00:00.000Z',
    updated_at: '2026-07-13T00:00:00.000Z',
    deleted_at: status === 'deleted' ? '2026-07-13T00:02:00.000Z' : null
  }
}

function storedAsset(alt: string): StoredMediaAsset {
  const value = row()
  return {
    id: value.id,
    sha256: value.sha256,
    path: value.storage_path,
    locator: oldLocator,
    mimeType: 'image/png',
    originalName: value.original_name,
    alt,
    size: 10,
    width: 1,
    height: 1,
    frames: 1,
    uploaderLogin: 'admin',
    status: 'ready',
    url: value.public_url,
    candidateKind: 'custom-cdn',
    candidates: [],
    availabilityCheckedAt: value.availability_checked_at,
    processingStartedAt: null,
    errorCode: null,
    errorMessage: null,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    deletedAt: null
  }
}

function uploadAsset(available: boolean): MediaAsset {
  const path = `${newLocator.pathPrefix}/aa/${hash}.png`
  const url = `https://new.example.test/${path}`
  return {
    id: hash,
    sha256: hash,
    path,
    locator: newLocator,
    mimeType: 'image/png',
    size: 10,
    width: 1,
    height: 1,
    frames: 1,
    provider: 'github',
    url,
    markdown: `![image](${url})`,
    candidates: [{ kind: 'custom-cdn', url }],
    available,
    created: false,
    checkedAt: '2026-07-13T00:03:00.000Z'
  }
}

function normalizedSql(fragment: string): string {
  const statement = [...db.statements].reverse().find(item => item.text.includes(fragment))
  if (!statement) throw new Error(`SQL statement not found: ${fragment}`)
  return statement.text.replace(/\s+/g, ' ').trim()
}

describe('media repository', () => {
  beforeEach(() => {
    vi.stubEnv('POSTGRES_URL', 'postgres://test.invalid/db')
    vi.stubEnv('IMAGE_GITHUB_OWNER', oldLocator.owner)
    vi.stubEnv('IMAGE_GITHUB_REPO', oldLocator.repo)
    db.statements.length = 0
    db.handler.mockReset().mockReturnValue({ rows: [] })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('escapes both Markdown alt delimiters', () => {
    expect(toMediaDto(storedAsset('diagram [draft]')).markdown).toBe(
      '![diagram \\[draft\\]](https://old.example.test/image.png)'
    )
  })

  it('never exposes a URL before the asset is ready', () => {
    const processing = { ...storedAsset('image'), status: 'processing' as const }
    expect(toMediaDto(processing)).toMatchObject({ url: null, markdown: null })
  })

  it('keeps a ready asset storage locator, candidates, and public URL immutable on duplicate upload', async () => {
    const existing = row({ status: 'ready' })
    db.handler.mockImplementation((text: string) => text.includes('INSERT INTO media_assets')
      ? { rows: [existing] }
      : { rows: [] })

    const saved = await saveUploadedMedia({
      asset: uploadAsset(false),
      originalName: 'renamed.png',
      alt: 'updated alt',
      uploaderLogin: 'admin'
    })

    expect(saved).toMatchObject({
      status: 'ready',
      path: existing.storage_path,
      locator: oldLocator,
      candidates: existing.candidates,
      url: existing.public_url
    })
    const statement = normalizedSql('INSERT INTO media_assets')
    expect(statement).toContain("WHEN media_assets.status = 'ready' THEN media_assets.storage_path")
    expect(statement).toContain("WHEN media_assets.status = 'ready' THEN media_assets.candidates")
    expect(statement).toContain("WHEN media_assets.status = 'ready' THEN media_assets.public_url")
  })

  it('returns 409 for a duplicate of a deleted asset until it is explicitly restored', async () => {
    const deleted = row({ status: 'deleted' })
    db.handler.mockImplementation((text: string) => {
      if (text.includes('INSERT INTO media_assets')) return { rows: [] }
      if (text.includes('SELECT * FROM media_assets')) return { rows: [deleted] }
      return { rows: [] }
    })

    await expect(saveUploadedMedia({
      asset: uploadAsset(false),
      originalName: 'image.png',
      alt: '',
      uploaderLogin: 'admin'
    })).rejects.toMatchObject({
      status: 409,
      code: 'MEDIA_STORAGE_CONFLICT',
      message: expect.stringContaining('Restore it explicitly')
    })
    expect(normalizedSql('INSERT INTO media_assets')).toContain("WHERE media_assets.status <> 'deleted'")
  })

  it.each(['processing', 'failed'] as const)(
    'atomically adopts the complete new provider snapshot when retrying a %s asset',
    async status => {
      const migrated = row({
        status: 'processing',
        locator: newLocator,
        path: uploadAsset(false).path,
        candidates: uploadAsset(false).candidates,
        leaseToken: null,
        leaseExpiresAt: null,
        processingStartedAt: status === 'processing' ? '2026-07-13T00:00:00.000Z' : '2026-07-13T00:03:00.000Z'
      })
      db.handler.mockImplementation((text: string) => text.includes('INSERT INTO media_assets')
        ? { rows: [migrated] }
        : { rows: [] })

      const saved = await saveUploadedMedia({
        asset: uploadAsset(false),
        originalName: 'image.png',
        alt: '',
        uploaderLogin: 'admin'
      })

      expect(saved).toMatchObject({
        status: 'processing',
        path: uploadAsset(false).path,
        locator: newLocator,
        candidates: uploadAsset(false).candidates
      })
      const statement = normalizedSql('INSERT INTO media_assets')
      expect(statement).toContain('ELSE EXCLUDED.storage_path')
      expect(statement).toContain('ELSE EXCLUDED.candidates')
      expect(statement).toContain('COALESCE(media_assets.processing_started_at, EXCLUDED.processing_started_at)')
      expect(statement).toContain("probe_lease_token = CASE WHEN media_assets.status = 'ready' THEN media_assets.probe_lease_token ELSE NULL END")
    }
  )

  it('claims only an expired processing lease in one database statement', async () => {
    db.handler.mockImplementation((text: string) => text.includes('WITH claimed AS')
      ? { rows: [{ ...row({ status: 'processing' }), lease_acquired: true }] }
      : { rows: [] })

    const claim = await claimMediaProbeLease({ id: hash, token: 'lease_token_123456', leaseMs: 15_000 })

    expect(claim).toMatchObject({ acquired: true, asset: { id: hash, status: 'processing' } })
    const statement = normalizedSql('WITH claimed AS')
    expect(statement).toContain("status = 'processing'")
    expect(statement).toContain('probe_lease_expires_at IS NULL OR probe_lease_expires_at <= NOW()')
    expect(statement).toContain('NOT EXISTS (SELECT 1 FROM claimed)')
    expect(statement).not.toContain('processing_started_at =')
  })

  it('writes false and timeout results only for the matching processing lease', async () => {
    const processing = row({ status: 'processing' })
    const failed = row({ status: 'failed' })
    db.handler.mockImplementation((text: string) => {
      if (text.includes('status = CASE WHEN')) return { rows: [processing] }
      if (text.includes("status = 'failed'")) return { rows: [failed] }
      return { rows: [] }
    })
    const token = 'lease_token_123456'

    await updateMediaAvailability(hash, token, {
      available: false,
      checkedAt: '2026-07-13T00:00:10.000Z'
    })
    let statement = normalizedSql('status = CASE WHEN')
    expect(statement).toContain('ELSE public_url END')
    expect(statement).toContain("AND status = 'processing'")
    expect(statement).toContain('AND probe_lease_token =')
    expect(statement).toContain('AND probe_lease_expires_at > NOW()')

    await markMediaFailed(
      hash,
      token,
      'MEDIA_PROCESSING_TIMEOUT',
      'deadline reached',
      '2026-07-13T00:01:00.000Z'
    )
    statement = normalizedSql("status = 'failed'")
    expect(statement).toContain("AND status = 'processing'")
    expect(statement).toContain('AND probe_lease_token =')
    expect(statement).toContain('AND probe_lease_expires_at > NOW()')
  })
})
