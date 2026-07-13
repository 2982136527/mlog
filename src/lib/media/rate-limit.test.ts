import { describe, expect, it, vi } from 'vitest'
import { MediaError } from './errors'
import { PostgresMediaRateLimiter, type MediaRateLimitDatabase } from './rate-limit'

const secret = 'test-secret-with-at-least-thirty-two-characters'

function databaseWithCounts(counts: Array<[number, number]>): {
  database: MediaRateLimitDatabase
  query: ReturnType<typeof vi.fn>
} {
  let consumeIndex = 0
  const query = vi.fn(async (text: string) => {
    if (!text.includes('RETURNING scope')) return { rows: [] }
    const [actor, ip] = counts[Math.min(consumeIndex, counts.length - 1)]
    consumeIndex += 1
    return {
      rows: [
        { scope: 'actor', request_count: actor },
        { scope: 'ip', request_count: ip }
      ]
    }
  })
  return { database: { query }, query }
}

describe('PostgresMediaRateLimiter', () => {
  it('initializes schema once and consumes actor/IP counters atomically', async () => {
    const { database, query } = databaseWithCounts([[1, 1], [2, 2]])
    const limiter = new PostgresMediaRateLimiter({
      database,
      hmacSecret: secret,
      now: () => Date.parse('2026-07-13T12:01:00.000Z')
    })

    await limiter.consume({ actor: 'Admin', ip: '203.0.113.8' })
    await limiter.consume({ actor: 'Admin', ip: '203.0.113.8' })

    expect(query).toHaveBeenCalledTimes(6)
    const consumeCalls = query.mock.calls.filter(call => String(call[0]).includes('RETURNING scope'))
    expect(consumeCalls).toHaveLength(2)
    expect(consumeCalls[0][0]).toContain('ON CONFLICT')
    expect(consumeCalls[0][1]).toHaveLength(3)
    expect(JSON.stringify(consumeCalls[0][1])).not.toContain('Admin')
    expect(JSON.stringify(consumeCalls[0][1])).not.toContain('203.0.113.8')
  })

  it('returns 429 with a bounded retry time when either dimension exceeds its limit', async () => {
    const { database } = databaseWithCounts([[3, 1]])
    const limiter = new PostgresMediaRateLimiter({
      database,
      hmacSecret: secret,
      actorLimit: 2,
      ipLimit: 10,
      windowMs: 60_000,
      now: () => Date.parse('2026-07-13T12:00:30.000Z')
    })

    await expect(limiter.consume({ actor: 'agent', ip: '2001:db8::1' })).rejects.toMatchObject({
      code: 'MEDIA_RATE_LIMITED',
      status: 429,
      retryAfterSeconds: 30
    })
  })

  it('enforces actor and global daily byte quotas atomically without storing identities', async () => {
    const query = vi.fn(async (text: string, values?: unknown[]) => {
      void values
      if (!text.includes('RETURNING scope, bytes_used')) return { rows: [] }
      return {
        rows: [
          { scope: 'actor', bytes_used: 101 },
          { scope: 'global', bytes_used: 201 }
        ]
      }
    })
    const limiter = new PostgresMediaRateLimiter({
      database: { query },
      hmacSecret: secret,
      actorDailyBytes: 100,
      globalDailyBytes: 1_000,
      now: () => Date.parse('2026-07-13T12:00:00.000Z')
    })

    await expect(limiter.consumeBytes({ actor: 'Admin', bytes: 10 })).rejects.toMatchObject({
      code: 'MEDIA_DAILY_QUOTA_EXCEEDED',
      status: 429
    })
    const call = query.mock.calls.find(([text]) => String(text).includes('RETURNING scope, bytes_used'))
    expect(call?.[1]).toHaveLength(4)
    expect(JSON.stringify(call?.[1])).not.toContain('Admin')
  })

  it('fails closed when schema initialization or consumption fails', async () => {
    const database: MediaRateLimitDatabase = {
      query: vi.fn().mockRejectedValue(new Error('database unavailable'))
    }
    const limiter = new PostgresMediaRateLimiter({ database, hmacSecret: secret })

    await expect(limiter.consume({ actor: 'agent', ip: '203.0.113.9' })).rejects.toMatchObject({
      code: 'MEDIA_RATE_LIMIT_UNAVAILABLE',
      status: 503
    })
  })

  it('rejects invalid identities before touching the database', async () => {
    const { database, query } = databaseWithCounts([[1, 1]])
    const limiter = new PostgresMediaRateLimiter({ database, hmacSecret: secret })

    await expect(limiter.consume({ actor: '', ip: 'not-an-ip' })).rejects.toBeInstanceOf(MediaError)
    expect(query).not.toHaveBeenCalled()
  })

  it('canonicalizes equivalent IPv6 representations into the same private counter key', async () => {
    const { database, query } = databaseWithCounts([[1, 1], [2, 2]])
    const limiter = new PostgresMediaRateLimiter({ database, hmacSecret: secret })

    await limiter.consume({ actor: 'agent', ip: '2001:0db8:0:0:0:0:0:1' })
    await limiter.consume({ actor: 'agent', ip: '2001:db8::1' })

    const consumeCalls = query.mock.calls.filter(call => String(call[0]).includes('RETURNING scope'))
    expect(consumeCalls[0][1][1]).toBe(consumeCalls[1][1][1])
  })
})
