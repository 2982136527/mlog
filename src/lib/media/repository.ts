import 'server-only'
import { sql } from '@vercel/postgres'
import type { MediaAsset, MediaAvailability, MediaCandidate, MediaMimeType, MediaProviderLocator } from './types'
import { MediaError } from './errors'

export type MediaStatus = 'processing' | 'ready' | 'failed' | 'deleted'

export type StoredMediaAsset = {
  id: string
  sha256: string
  path: string
  locator: MediaProviderLocator
  mimeType: MediaMimeType
  originalName: string
  alt: string
  size: number
  width: number
  height: number
  frames: number
  uploaderLogin: string
  status: MediaStatus
  url: string | null
  candidateKind: MediaCandidate['kind'] | null
  candidates: MediaCandidate[]
  availabilityCheckedAt: string | null
  processingStartedAt: string | null
  errorCode: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export type MediaDto = {
  id: string
  status: MediaStatus
  filename: string
  alt: string
  mimeType: MediaMimeType
  size: number
  width: number
  height: number
  hash: string
  url: string | null
  markdown: string | null
  createdAt: string
  deletedAt: string | null
  duplicate: boolean
  availability: {
    available: boolean
    checkedAt: string | null
  }
  error: {
    code: string
    message: string
    retryable: boolean
  } | null
}

type MediaRow = {
  id: string
  sha256: string
  storage_path: string
  provider_owner: string | null
  provider_repo: string | null
  provider_branch: string | null
  provider_path_prefix: string | null
  mime_type: MediaMimeType
  original_name: string
  alt_text: string
  size_bytes: string | number
  width: number
  height: number
  frames: number
  uploader_login: string
  status: MediaStatus
  public_url: string | null
  candidate_kind: MediaCandidate['kind'] | null
  candidates: MediaCandidate[] | string
  availability_checked_at: string | null
  processing_started_at: string | null
  probe_lease_token: string | null
  probe_lease_expires_at: string | null
  purge_lease_token: string | null
  purge_lease_expires_at: string | null
  error_code: string | null
  error_message: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

type MediaLeaseRow = MediaRow & {
  lease_acquired: boolean
}

export type MediaProbeLeaseClaim = {
  acquired: boolean
  asset: StoredMediaAsset
}

let ensureSchemaPromise: Promise<void> | null = null

function assertDatabaseConfigured(): void {
  if (!(process.env.POSTGRES_URL || '').trim()) {
    throw new MediaError({
      status: 503,
      code: 'MEDIA_STORAGE_UNAVAILABLE',
      message: 'POSTGRES_URL is required for durable media state.',
      retryable: true
    })
  }
}

async function createSchema(): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS media_assets (
    id TEXT PRIMARY KEY,
    sha256 TEXT NOT NULL UNIQUE,
    storage_path TEXT NOT NULL UNIQUE,
    provider_owner TEXT NOT NULL,
    provider_repo TEXT NOT NULL,
    provider_branch TEXT NOT NULL,
    provider_path_prefix TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    original_name TEXT NOT NULL,
    alt_text TEXT NOT NULL DEFAULT '',
    size_bytes BIGINT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    frames INTEGER NOT NULL DEFAULT 1,
    uploader_login TEXT NOT NULL,
    status TEXT NOT NULL,
    public_url TEXT NULL,
    candidate_kind TEXT NULL,
    candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
    availability_checked_at TIMESTAMPTZ NULL,
    processing_started_at TIMESTAMPTZ NULL,
    probe_lease_token TEXT NULL,
    probe_lease_expires_at TIMESTAMPTZ NULL,
    purge_lease_token TEXT NULL,
    purge_lease_expires_at TIMESTAMPTZ NULL,
    error_code TEXT NULL,
    error_message TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL,
    CONSTRAINT media_assets_sha256_check CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT media_assets_mime_check CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
    CONSTRAINT media_assets_status_check CHECK (status IN ('processing', 'ready', 'failed', 'deleted'))
  )`
  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS provider_owner TEXT NULL`
  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS provider_repo TEXT NULL`
  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS provider_branch TEXT NULL`
  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS provider_path_prefix TEXT NULL`
  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ NULL`
  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS probe_lease_token TEXT NULL`
  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS probe_lease_expires_at TIMESTAMPTZ NULL`
  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS purge_lease_token TEXT NULL`
  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS purge_lease_expires_at TIMESTAMPTZ NULL`
  await sql`UPDATE media_assets SET processing_started_at = created_at WHERE status = 'processing' AND processing_started_at IS NULL`
  await sql`CREATE INDEX IF NOT EXISTS media_assets_created_idx ON media_assets(created_at DESC, id DESC)`
  await sql`CREATE INDEX IF NOT EXISTS media_assets_status_created_idx ON media_assets(status, created_at DESC, id DESC)`
  await sql`CREATE INDEX IF NOT EXISTS media_assets_uploader_idx ON media_assets(uploader_login, created_at DESC)`
  await sql`CREATE INDEX IF NOT EXISTS media_assets_probe_lease_idx ON media_assets(status, probe_lease_expires_at) WHERE status = 'processing'`
  await sql`CREATE INDEX IF NOT EXISTS media_assets_purge_lease_idx ON media_assets(status, purge_lease_expires_at) WHERE status = 'deleted'`
}

export async function ensureMediaSchema(): Promise<void> {
  assertDatabaseConfigured()
  if (!ensureSchemaPromise) {
    ensureSchemaPromise = createSchema().catch(error => {
      ensureSchemaPromise = null
      throw error
    })
  }

  try {
    await ensureSchemaPromise
  } catch (error) {
    if (error instanceof MediaError) throw error
    throw new MediaError({
      status: 503,
      code: 'MEDIA_STORAGE_UNAVAILABLE',
      message: error instanceof Error ? error.message : 'Failed to initialize media storage.',
      retryable: true
    })
  }
}

function parseCandidates(value: MediaRow['candidates']): MediaCandidate[] {
  if (Array.isArray(value)) return value
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as MediaCandidate[] : []
  } catch {
    return []
  }
}

function toStored(row: MediaRow): StoredMediaAsset {
  const fallbackOwner = (process.env.IMAGE_GITHUB_OWNER || '').trim()
  const fallbackRepo = (process.env.IMAGE_GITHUB_REPO || '').trim()
  const fallbackBranch = (process.env.IMAGE_GITHUB_BRANCH || 'main').trim().replace(/^refs\/heads\//, '')
  const fallbackPrefix = (process.env.IMAGE_GITHUB_PATH_PREFIX || 'uploads/blog').trim().replace(/^\/+|\/+$/g, '')
  return {
    id: row.id,
    sha256: row.sha256,
    path: row.storage_path,
    locator: {
      owner: row.provider_owner || fallbackOwner,
      repo: row.provider_repo || fallbackRepo,
      branch: row.provider_branch || fallbackBranch,
      pathPrefix: row.provider_path_prefix || fallbackPrefix
    },
    mimeType: row.mime_type,
    originalName: row.original_name,
    alt: row.alt_text,
    size: Number(row.size_bytes),
    width: row.width,
    height: row.height,
    frames: row.frames,
    uploaderLogin: row.uploader_login,
    status: row.status,
    url: row.public_url,
    candidateKind: row.candidate_kind,
    candidates: parseCandidates(row.candidates),
    availabilityCheckedAt: row.availability_checked_at,
    processingStartedAt: row.processing_started_at,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at
  }
}

function markdownAlt(value: string, fallback: string): string {
  return (value.trim() || fallback)
    .replace(/[\r\n]+/g, ' ')
    .replaceAll('\\', '\\\\')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')
    .slice(0, 300)
}

function safeOriginalName(value: string, mimeType: MediaMimeType): string {
  const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1]
  return value
    .replace(/[\u0000-\u001f\u007f/\\]+/g, '-')
    .trim()
    .slice(0, 300) || `image.${extension}`
}

export function toMediaDto(asset: StoredMediaAsset, duplicate = false): MediaDto {
  const ready = asset.status === 'ready' && Boolean(asset.url)
  return {
    id: asset.id,
    status: asset.status,
    filename: asset.originalName,
    alt: asset.alt,
    mimeType: asset.mimeType,
    size: asset.size,
    width: asset.width,
    height: asset.height,
    hash: asset.sha256,
    url: ready ? asset.url : null,
    markdown: ready ? `![${markdownAlt(asset.alt, asset.originalName)}](${asset.url})` : null,
    createdAt: asset.createdAt,
    deletedAt: asset.deletedAt,
    duplicate,
    availability: {
      available: ready,
      checkedAt: asset.availabilityCheckedAt
    },
    error: asset.status === 'failed'
      ? {
          code: asset.errorCode || 'MEDIA_PROCESSING_FAILED',
          message: asset.errorMessage || 'Media processing failed.',
          retryable: true
        }
      : null
  }
}

export async function saveUploadedMedia(input: {
  asset: MediaAsset
  originalName: string
  alt: string
  uploaderLogin: string
}): Promise<StoredMediaAsset> {
  await ensureMediaSchema()
  const status: MediaStatus = input.asset.available ? 'ready' : 'processing'
  const publicUrl = input.asset.available ? input.asset.url : null
  const candidateKind = input.asset.available
    ? input.asset.candidates.find(candidate => candidate.url === input.asset.url)?.kind || null
    : null
  const candidatesJson = JSON.stringify(input.asset.candidates)

  const result = await sql<MediaRow>`
    INSERT INTO media_assets (
      id, sha256, storage_path, provider_owner, provider_repo, provider_branch, provider_path_prefix,
      mime_type, original_name, alt_text,
      size_bytes, width, height, frames, uploader_login, status,
      public_url, candidate_kind, candidates, availability_checked_at, processing_started_at
    ) VALUES (
      ${input.asset.id}, ${input.asset.sha256}, ${input.asset.path},
      ${input.asset.locator.owner}, ${input.asset.locator.repo}, ${input.asset.locator.branch}, ${input.asset.locator.pathPrefix},
      ${input.asset.mimeType},
      ${safeOriginalName(input.originalName, input.asset.mimeType)}, ${input.alt.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 500)}, ${input.asset.size},
      ${input.asset.width}, ${input.asset.height}, ${input.asset.frames},
      ${input.uploaderLogin}, ${status}, ${publicUrl}, ${candidateKind},
      CAST(${candidatesJson} AS JSONB), ${input.asset.checkedAt},
      ${status === 'processing' ? new Date().toISOString() : null}
    )
    ON CONFLICT (id) DO UPDATE SET
      original_name = EXCLUDED.original_name,
      storage_path = CASE WHEN media_assets.status = 'ready' THEN media_assets.storage_path ELSE EXCLUDED.storage_path END,
      provider_owner = CASE WHEN media_assets.status = 'ready' THEN media_assets.provider_owner ELSE EXCLUDED.provider_owner END,
      provider_repo = CASE WHEN media_assets.status = 'ready' THEN media_assets.provider_repo ELSE EXCLUDED.provider_repo END,
      provider_branch = CASE WHEN media_assets.status = 'ready' THEN media_assets.provider_branch ELSE EXCLUDED.provider_branch END,
      provider_path_prefix = CASE WHEN media_assets.status = 'ready' THEN media_assets.provider_path_prefix ELSE EXCLUDED.provider_path_prefix END,
      alt_text = CASE WHEN EXCLUDED.alt_text <> '' THEN EXCLUDED.alt_text ELSE media_assets.alt_text END,
      status = CASE
        WHEN media_assets.status = 'ready' THEN 'ready'
        ELSE EXCLUDED.status
      END,
      public_url = CASE
        WHEN media_assets.status = 'ready' THEN media_assets.public_url
        ELSE EXCLUDED.public_url
      END,
      candidate_kind = CASE
        WHEN media_assets.status = 'ready' THEN media_assets.candidate_kind
        ELSE EXCLUDED.candidate_kind
      END,
      candidates = CASE WHEN media_assets.status = 'ready' THEN media_assets.candidates ELSE EXCLUDED.candidates END,
      availability_checked_at = CASE
        WHEN media_assets.status = 'ready' THEN media_assets.availability_checked_at
        ELSE EXCLUDED.availability_checked_at
      END,
      processing_started_at = CASE
        WHEN media_assets.status <> 'ready' AND EXCLUDED.status = 'processing'
          THEN COALESCE(media_assets.processing_started_at, EXCLUDED.processing_started_at)
        ELSE NULL
      END,
      probe_lease_token = CASE WHEN media_assets.status = 'ready' THEN media_assets.probe_lease_token ELSE NULL END,
      probe_lease_expires_at = CASE WHEN media_assets.status = 'ready' THEN media_assets.probe_lease_expires_at ELSE NULL END,
      error_code = CASE WHEN media_assets.status = 'ready' THEN media_assets.error_code ELSE NULL END,
      error_message = CASE WHEN media_assets.status = 'ready' THEN media_assets.error_message ELSE NULL END,
      updated_at = NOW()
    WHERE media_assets.status <> 'deleted'
    RETURNING *
  `
  const row = result.rows[0]
  if (row) return toStored(row)

  const existing = await getMediaById(input.asset.id, true)
  if (existing?.status === 'deleted') {
    throw new MediaError({
      status: 409,
      code: 'MEDIA_STORAGE_CONFLICT',
      message: 'This media asset is deleted. Restore it explicitly before uploading the same content again.'
    })
  }
  throw new MediaError({
    status: 409,
    code: 'MEDIA_STORAGE_CONFLICT',
    message: 'The uploaded media conflicts with an existing asset.'
  })
}

export async function getMediaById(id: string, includeDeleted = false): Promise<StoredMediaAsset | null> {
  await ensureMediaSchema()
  const result = await sql<MediaRow>`
    SELECT * FROM media_assets
    WHERE id = ${id} AND (${includeDeleted} OR deleted_at IS NULL)
    LIMIT 1
  `
  return result.rows[0] ? toStored(result.rows[0]) : null
}

export async function claimMediaProbeLease(input: {
  id: string
  token: string
  leaseMs: number
}): Promise<MediaProbeLeaseClaim | null> {
  await ensureMediaSchema()
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(input.token) || !Number.isSafeInteger(input.leaseMs) || input.leaseMs < 1_000 || input.leaseMs > 60_000) {
    throw new MediaError({
      status: 500,
      code: 'MEDIA_CONFIG_INVALID',
      message: 'Invalid media probe lease configuration.'
    })
  }

  const result = await sql<MediaLeaseRow>`
    WITH claimed AS (
      UPDATE media_assets SET
        probe_lease_token = ${input.token},
        probe_lease_expires_at = NOW() + (${input.leaseMs} * INTERVAL '1 millisecond')
      WHERE id = ${input.id}
        AND status = 'processing'
        AND deleted_at IS NULL
        AND (probe_lease_expires_at IS NULL OR probe_lease_expires_at <= NOW())
      RETURNING media_assets.*, TRUE AS lease_acquired
    )
    SELECT * FROM claimed
    UNION ALL
    SELECT media_assets.*, FALSE AS lease_acquired
    FROM media_assets
    WHERE id = ${input.id} AND NOT EXISTS (SELECT 1 FROM claimed)
    LIMIT 1
  `
  const row = result.rows[0]
  return row ? { acquired: row.lease_acquired, asset: toStored(row) } : null
}

function assertLeaseToken(token: string): void {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) {
    throw new MediaError({
      status: 500,
      code: 'MEDIA_CONFIG_INVALID',
      message: 'Invalid media probe lease token.'
    })
  }
}

export async function updateMediaAvailability(
  id: string,
  leaseToken: string,
  availability: MediaAvailability
): Promise<StoredMediaAsset | null> {
  await ensureMediaSchema()
  assertLeaseToken(leaseToken)
  if (availability.available && (!availability.url || !availability.candidateKind)) {
    throw new MediaError({
      status: 502,
      code: 'MEDIA_STORAGE_UNAVAILABLE',
      message: 'An available media probe must identify an approved public URL.',
      retryable: true
    })
  }
  const publicUrl = availability.available ? availability.url || null : null
  const candidateKind = availability.available ? availability.candidateKind || null : null
  const result = await sql<MediaRow>`
    UPDATE media_assets SET
      status = CASE WHEN ${availability.available} THEN 'ready' ELSE 'processing' END,
      public_url = CASE WHEN ${availability.available} THEN ${publicUrl} ELSE public_url END,
      candidate_kind = CASE WHEN ${availability.available} THEN ${candidateKind} ELSE candidate_kind END,
      availability_checked_at = ${availability.checkedAt},
      processing_started_at = CASE WHEN ${availability.available} THEN NULL ELSE processing_started_at END,
      probe_lease_token = NULL,
      probe_lease_expires_at = NULL,
      error_code = NULL,
      error_message = NULL,
      updated_at = NOW()
    WHERE id = ${id}
      AND status = 'processing'
      AND deleted_at IS NULL
      AND probe_lease_token = ${leaseToken}
      AND probe_lease_expires_at > NOW()
    RETURNING *
  `
  return result.rows[0] ? toStored(result.rows[0]) : null
}

export async function markMediaFailed(
  id: string,
  leaseToken: string,
  code: string,
  message: string,
  checkedAt: string
): Promise<StoredMediaAsset | null> {
  await ensureMediaSchema()
  assertLeaseToken(leaseToken)
  const result = await sql<MediaRow>`
    UPDATE media_assets SET
      status = 'failed', error_code = ${code.slice(0, 120)},
      error_message = ${message.slice(0, 1000)}, availability_checked_at = ${checkedAt},
      processing_started_at = NULL, probe_lease_token = NULL, probe_lease_expires_at = NULL,
      updated_at = NOW()
    WHERE id = ${id}
      AND status = 'processing'
      AND deleted_at IS NULL
      AND probe_lease_token = ${leaseToken}
      AND probe_lease_expires_at > NOW()
    RETURNING *
  `
  return result.rows[0] ? toStored(result.rows[0]) : null
}

export async function releaseMediaProbeLease(id: string, leaseToken: string): Promise<StoredMediaAsset | null> {
  await ensureMediaSchema()
  assertLeaseToken(leaseToken)
  const result = await sql<MediaRow>`
    UPDATE media_assets SET probe_lease_token = NULL, probe_lease_expires_at = NULL
    WHERE id = ${id}
      AND status = 'processing'
      AND deleted_at IS NULL
      AND probe_lease_token = ${leaseToken}
    RETURNING *
  `
  return result.rows[0] ? toStored(result.rows[0]) : null
}

type MediaCursor = { createdAt: string; id: string }

function decodeCursor(value: string | null | undefined): MediaCursor | null {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (
      typeof parsed === 'object'
      && parsed !== null
      && 'createdAt' in parsed
      && 'id' in parsed
      && typeof parsed.createdAt === 'string'
      && typeof parsed.id === 'string'
      && !Number.isNaN(Date.parse(parsed.createdAt))
    ) {
      return { createdAt: parsed.createdAt, id: parsed.id }
    }
  } catch {
    // Invalid cursors are reported as a stable client error below.
  }
  throw new MediaError({
    status: 400,
    code: 'MEDIA_INVALID_INPUT',
    message: 'Invalid media pagination cursor.'
  })
}

function encodeCursor(asset: StoredMediaAsset): string {
  return Buffer.from(JSON.stringify({ createdAt: asset.createdAt, id: asset.id }), 'utf8').toString('base64url')
}

export async function listMediaAssets(input: {
  cursor?: string | null
  limit?: number
  query?: string
  status?: MediaStatus | 'all'
}): Promise<{ items: StoredMediaAsset[]; nextCursor: string | null }> {
  await ensureMediaSchema()
  const cursor = decodeCursor(input.cursor)
  const limit = Math.min(100, Math.max(1, Math.floor(input.limit || 30)))
  const query = (input.query || '').trim().slice(0, 200)
  const search = `%${query}%`
  const status = input.status || 'all'
  const cursorDate = cursor?.createdAt || null
  const cursorId = cursor?.id || ''

  const result = await sql<MediaRow>`
    SELECT * FROM media_assets
    WHERE (${status} = 'all' OR status = ${status})
      AND (${query} = '' OR original_name ILIKE ${search} OR alt_text ILIKE ${search} OR sha256 = ${query.toLowerCase()})
      AND (
        ${cursorDate}::timestamptz IS NULL
        OR created_at < ${cursorDate}::timestamptz
        OR (created_at = ${cursorDate}::timestamptz AND id < ${cursorId})
      )
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit + 1}
  `

  const rows = result.rows.map(toStored)
  const hasMore = rows.length > limit
  const items = rows.slice(0, limit)
  return {
    items,
    nextCursor: hasMore && items.length > 0 ? encodeCursor(items[items.length - 1]) : null
  }
}

export async function softDeleteMedia(id: string): Promise<StoredMediaAsset | null> {
  await ensureMediaSchema()
  const result = await sql<MediaRow>`
    UPDATE media_assets SET
      status = 'deleted', deleted_at = NOW(), probe_lease_token = NULL,
      probe_lease_expires_at = NULL, purge_lease_token = NULL,
      purge_lease_expires_at = NULL, updated_at = NOW()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING *
  `
  return result.rows[0] ? toStored(result.rows[0]) : null
}

export async function restoreMedia(id: string): Promise<StoredMediaAsset | null> {
  await ensureMediaSchema()
  const result = await sql<MediaRow>`
    UPDATE media_assets SET
      status = CASE WHEN public_url IS NULL THEN 'processing' ELSE 'ready' END,
      processing_started_at = CASE WHEN public_url IS NULL THEN NOW() ELSE NULL END,
      probe_lease_token = NULL,
      probe_lease_expires_at = NULL,
      purge_lease_token = NULL,
      purge_lease_expires_at = NULL,
      deleted_at = NULL,
      updated_at = NOW()
    WHERE id = ${id}
      AND deleted_at IS NOT NULL
      AND purge_lease_token IS NULL
    RETURNING *
  `
  return result.rows[0] ? toStored(result.rows[0]) : null
}

function assertPurgeLeaseInput(token: string, leaseMs?: number): void {
  if (
    !/^[A-Za-z0-9_-]{16,128}$/.test(token)
    || (leaseMs !== undefined && (!Number.isSafeInteger(leaseMs) || leaseMs < 30_000 || leaseMs > 15 * 60_000))
  ) {
    throw new MediaError({
      status: 500,
      code: 'MEDIA_CONFIG_INVALID',
      message: 'Invalid media purge lease configuration.'
    })
  }
}

export async function claimMediaPurge(input: {
  id: string
  deletedAt: string
  token: string
  leaseMs: number
}): Promise<StoredMediaAsset | null> {
  await ensureMediaSchema()
  assertPurgeLeaseInput(input.token, input.leaseMs)
  const result = await sql<MediaRow>`
    UPDATE media_assets SET
      purge_lease_token = ${input.token},
      purge_lease_expires_at = NOW() + (${input.leaseMs} * INTERVAL '1 millisecond'),
      updated_at = NOW()
    WHERE id = ${input.id}
      AND status = 'deleted'
      AND deleted_at = ${input.deletedAt}::timestamptz
      AND (
        purge_lease_token IS NULL
        OR (purge_lease_expires_at IS NOT NULL AND purge_lease_expires_at <= NOW())
      )
    RETURNING *
  `
  return result.rows[0] ? toStored(result.rows[0]) : null
}

export async function removeClaimedMediaRecord(id: string, purgeToken: string): Promise<boolean> {
  await ensureMediaSchema()
  assertPurgeLeaseInput(purgeToken)
  const result = await sql<{ id: string }>`
    DELETE FROM media_assets
    WHERE id = ${id}
      AND status = 'deleted'
      AND deleted_at IS NOT NULL
      AND purge_lease_token = ${purgeToken}
    RETURNING id
  `
  return result.rows.length === 1
}
