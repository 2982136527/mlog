import 'server-only'
import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import { sql } from '@vercel/postgres'
import { MediaError } from './errors'

export type MediaRateLimitInput = {
  actor: string
  ip: string
}

export type MediaRateLimitDecision = {
  remaining: number
  resetAt: string
}

export type MediaByteQuotaInput = {
  actor: string
  bytes: number
}

export interface MediaRateLimiter {
  consume(input: MediaRateLimitInput): Promise<MediaRateLimitDecision>
  consumeBytes?(input: MediaByteQuotaInput): Promise<MediaRateLimitDecision>
}

type QueryResult = {
  rows: Array<Record<string, unknown>>
}

export type MediaRateLimitDatabase = {
  query: (text: string, values?: unknown[]) => Promise<QueryResult>
}

type PostgresMediaRateLimiterOptions = {
  database: MediaRateLimitDatabase
  hmacSecret: string
  actorLimit?: number
  ipLimit?: number
  windowMs?: number
  actorDailyBytes?: number
  globalDailyBytes?: number
  now?: () => number
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS media_upload_rate_limits (
    scope TEXT NOT NULL CHECK (scope IN ('actor', 'ip')),
    key_hash TEXT NOT NULL,
    window_start BIGINT NOT NULL,
    request_count INTEGER NOT NULL CHECK (request_count > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (scope, key_hash, window_start)
  )
`

const EXPIRY_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS media_upload_rate_limits_window_idx
  ON media_upload_rate_limits(window_start)
`

const DAILY_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS media_upload_daily_usage (
    scope TEXT NOT NULL CHECK (scope IN ('actor', 'global')),
    key_hash TEXT NOT NULL,
    day_start BIGINT NOT NULL,
    bytes_used BIGINT NOT NULL CHECK (bytes_used > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (scope, key_hash, day_start)
  )
`

const DAILY_EXPIRY_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS media_upload_daily_usage_day_idx
  ON media_upload_daily_usage(day_start)
`

const CONSUME_SQL = `
  INSERT INTO media_upload_rate_limits (scope, key_hash, window_start, request_count)
  VALUES ('actor', $1, $3, 1), ('ip', $2, $3, 1)
  ON CONFLICT (scope, key_hash, window_start)
  DO UPDATE SET request_count = media_upload_rate_limits.request_count + 1, updated_at = NOW()
  RETURNING scope, request_count
`

const CONSUME_BYTES_SQL = `
  INSERT INTO media_upload_daily_usage (scope, key_hash, day_start, bytes_used)
  VALUES ('actor', $1, $4, $3), ('global', $2, $4, $3)
  ON CONFLICT (scope, key_hash, day_start)
  DO UPDATE SET bytes_used = media_upload_daily_usage.bytes_used + EXCLUDED.bytes_used, updated_at = NOW()
  RETURNING scope, bytes_used
`

function positiveInteger(input: number, label: string): number {
  if (!Number.isSafeInteger(input) || input < 1) {
    throw new MediaError({
      status: 500,
      code: 'MEDIA_CONFIG_INVALID',
      message: `${label} must be a positive integer.`
    })
  }
  return input
}

function normalizeActor(actor: string): string {
  const normalized = actor.trim().normalize('NFKC').toLowerCase()
  if (!normalized || normalized.length > 200 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new MediaError({
      status: 400,
      code: 'MEDIA_INVALID_INPUT',
      message: 'A valid media upload actor is required.'
    })
  }
  return normalized
}

function normalizeIp(ip: string): string {
  const input = ip.trim().replace(/^\[|\]$/g, '').toLowerCase()
  const version = isIP(input)
  if (!version) {
    throw new MediaError({
      status: 400,
      code: 'MEDIA_INVALID_INPUT',
      message: 'A valid client IP address is required for media uploads.'
    })
  }
  if (version === 6) {
    return new URL(`http://[${input}]/`).hostname.replace(/^\[|\]$/g, '')
  }
  return input
}

export class PostgresMediaRateLimiter implements MediaRateLimiter {
  private readonly actorLimit: number
  private readonly ipLimit: number
  private readonly windowMs: number
  private readonly actorDailyBytes: number
  private readonly globalDailyBytes: number
  private readonly now: () => number
  private schemaPromise: Promise<void> | null = null

  constructor(private readonly options: PostgresMediaRateLimiterOptions) {
    if (options.hmacSecret.length < 32) {
      throw new MediaError({
        status: 500,
        code: 'MEDIA_CONFIG_INVALID',
        message: 'The media rate-limit HMAC secret must contain at least 32 characters.'
      })
    }
    this.actorLimit = positiveInteger(options.actorLimit ?? 30, 'Media actor rate limit')
    this.ipLimit = positiveInteger(options.ipLimit ?? 60, 'Media IP rate limit')
    this.windowMs = positiveInteger(options.windowMs ?? 15 * 60_000, 'Media rate-limit window')
    this.actorDailyBytes = positiveInteger(options.actorDailyBytes ?? 128 * 1024 * 1024, 'Media actor daily byte quota')
    this.globalDailyBytes = positiveInteger(options.globalDailyBytes ?? 512 * 1024 * 1024, 'Media global daily byte quota')
    this.now = options.now || Date.now
  }

  async consume(input: MediaRateLimitInput): Promise<MediaRateLimitDecision> {
    const actor = normalizeActor(input.actor)
    const ip = normalizeIp(input.ip)
    const now = this.now()
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs

    try {
      await this.ensureSchema()
      const result = await this.options.database.query(CONSUME_SQL, [
        this.digest('actor', actor),
        this.digest('ip', ip),
        windowStart
      ])
      const counts = new Map<string, number>()
      for (const row of result.rows) {
        if (typeof row.scope === 'string') {
          counts.set(row.scope, Number(row.request_count))
        }
      }
      const actorCount = counts.get('actor')
      const ipCount = counts.get('ip')
      if (
        typeof actorCount !== 'number'
        || typeof ipCount !== 'number'
        || !Number.isSafeInteger(actorCount)
        || !Number.isSafeInteger(ipCount)
      ) {
        throw new Error('incomplete rate-limit result')
      }

      const resetAtMs = windowStart + this.windowMs
      if (actorCount > this.actorLimit || ipCount > this.ipLimit) {
        throw new MediaError({
          status: 429,
          code: 'MEDIA_RATE_LIMITED',
          message: 'The media upload rate limit has been exceeded.',
          retryable: true,
          retryAfterSeconds: Math.max(1, Math.ceil((resetAtMs - now) / 1_000))
        })
      }

      return {
        remaining: Math.max(0, Math.min(this.actorLimit - actorCount, this.ipLimit - ipCount)),
        resetAt: new Date(resetAtMs).toISOString()
      }
    } catch (error) {
      if (error instanceof MediaError) throw error
      throw new MediaError({
        status: 503,
        code: 'MEDIA_RATE_LIMIT_UNAVAILABLE',
        message: 'Media upload rate limiting is unavailable; the upload was rejected.',
        retryable: true
      })
    }
  }

  async consumeBytes(input: MediaByteQuotaInput): Promise<MediaRateLimitDecision> {
    const actor = normalizeActor(input.actor)
    const bytes = positiveInteger(input.bytes, 'Media upload bytes')
    const now = this.now()
    const dayMs = 24 * 60 * 60_000
    const dayStart = Math.floor(now / dayMs) * dayMs

    try {
      await this.ensureSchema()
      const result = await this.options.database.query(CONSUME_BYTES_SQL, [
        this.digest('actor', actor),
        this.digest('global', 'all-media-uploads'),
        bytes,
        dayStart
      ])
      const usage = new Map<string, number>()
      for (const row of result.rows) {
        if (typeof row.scope === 'string') usage.set(row.scope, Number(row.bytes_used))
      }
      const actorBytes = usage.get('actor')
      const globalBytes = usage.get('global')
      if (
        typeof actorBytes !== 'number'
        || typeof globalBytes !== 'number'
        || !Number.isSafeInteger(actorBytes)
        || !Number.isSafeInteger(globalBytes)
      ) {
        throw new Error('incomplete byte quota result')
      }
      const resetAtMs = dayStart + dayMs
      if (actorBytes > this.actorDailyBytes || globalBytes > this.globalDailyBytes) {
        throw new MediaError({
          status: 429,
          code: 'MEDIA_DAILY_QUOTA_EXCEEDED',
          message: 'The daily media upload byte quota has been exceeded.',
          retryable: true,
          retryAfterSeconds: Math.max(1, Math.ceil((resetAtMs - now) / 1_000))
        })
      }
      return {
        remaining: Math.max(0, Math.min(this.actorDailyBytes - actorBytes, this.globalDailyBytes - globalBytes)),
        resetAt: new Date(resetAtMs).toISOString()
      }
    } catch (error) {
      if (error instanceof MediaError) throw error
      throw new MediaError({
        status: 503,
        code: 'MEDIA_RATE_LIMIT_UNAVAILABLE',
        message: 'Media upload quota enforcement is unavailable; the upload was rejected.',
        retryable: true
      })
    }
  }

  private digest(scope: 'actor' | 'ip' | 'global', value: string): string {
    return createHmac('sha256', this.options.hmacSecret)
      .update(`mlog-media-rate-limit:v1:${scope}:`)
      .update(value)
      .digest('hex')
  }

  private ensureSchema(): Promise<void> {
    if (!this.schemaPromise) {
      this.schemaPromise = (async () => {
        await this.options.database.query(SCHEMA_SQL)
        await this.options.database.query(EXPIRY_INDEX_SQL)
        await this.options.database.query(DAILY_SCHEMA_SQL)
        await this.options.database.query(DAILY_EXPIRY_INDEX_SQL)
      })().catch(error => {
        this.schemaPromise = null
        throw error
      })
    }
    return this.schemaPromise
  }
}

export function createPostgresMediaRateLimiter(env: Record<string, string | undefined> = process.env): PostgresMediaRateLimiter {
  if (!(env.POSTGRES_URL || '').trim()) {
    throw new MediaError({
      status: 503,
      code: 'MEDIA_RATE_LIMIT_UNAVAILABLE',
      message: 'Media upload rate limiting requires Postgres configuration.',
      retryable: true
    })
  }
  const hmacSecret = (env.MEDIA_RATE_LIMIT_HMAC_SECRET || env.NEXTAUTH_SECRET || '').trim()
  if (!hmacSecret) {
    throw new MediaError({
      status: 503,
      code: 'MEDIA_RATE_LIMIT_UNAVAILABLE',
      message: 'Media upload rate limiting requires a server-side HMAC secret.',
      retryable: true
    })
  }

  const database: MediaRateLimitDatabase = {
    async query(text, values) {
      const result = await sql.query(text, values as never[] | undefined)
      return { rows: result.rows }
    }
  }
  const actorDailyBytes = env.MEDIA_ACTOR_DAILY_BYTES ? Number(env.MEDIA_ACTOR_DAILY_BYTES) : undefined
  const globalDailyBytes = env.MEDIA_GLOBAL_DAILY_BYTES ? Number(env.MEDIA_GLOBAL_DAILY_BYTES) : undefined
  return new PostgresMediaRateLimiter({ database, hmacSecret, actorDailyBytes, globalDailyBytes })
}

export const mediaRateLimitSql = {
  consume: CONSUME_SQL,
  consumeBytes: CONSUME_BYTES_SQL,
  schema: SCHEMA_SQL,
  dailySchema: DAILY_SCHEMA_SQL
}
