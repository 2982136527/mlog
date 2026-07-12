import { NextRequest } from 'next/server'
import { randomUUID, createHash } from 'node:crypto'
import { sql } from '@vercel/postgres'
import { getAuthSession } from '@/lib/auth'
import { AdminHttpError } from '@/lib/admin/errors'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { ensureUserAutomationSchema } from '@/lib/user/db'
import { ensureUserProfile } from '@/lib/user/db'

export async function GET() {
  const requestId = createRequestId()

  try {
    const session = await getAuthSession()
    const login = session?.user?.login?.trim()

    if (!login) {
      return fail(requestId, 401, 'UNAUTHORIZED', 'Authentication required.')
    }

    await ensureUserAutomationSchema()

    const result = await sql<{
      id: string
      key_prefix: string
      name: string
      created_at: string
      last_used_at: string | null
      is_active: boolean
    }>`
      SELECT id, key_prefix, name, created_at, last_used_at, is_active
      FROM user_api_keys
      WHERE user_login = ${login}
      ORDER BY created_at DESC
    `

    return ok(requestId, { keys: result.rows })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[user][api-keys][GET]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to list API keys.')
  }
}

export async function POST(request: NextRequest) {
  const requestId = createRequestId()

  try {
    const session = await getAuthSession()
    const login = session?.user?.login?.trim()

    if (!login) {
      return fail(requestId, 401, 'UNAUTHORIZED', 'Authentication required.')
    }

    const body = await request.json().catch(() => ({}))
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : ''

    if (!name) {
      return fail(requestId, 400, 'INVALID_INPUT', 'Key name is required (max 100 chars).')
    }

    const rawKey = 'mlog_' + randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '')
    const keyHash = createHash('sha256').update(rawKey).digest('hex')
    const keyPrefix = rawKey.slice(5, 13)

    await ensureUserAutomationSchema()
    await ensureUserProfile(login)

    const result = await sql<{ id: string; created_at: string }>`
      INSERT INTO user_api_keys (user_login, key_hash, key_prefix, name)
      VALUES (${login}, ${keyHash}, ${keyPrefix}, ${name})
      RETURNING id, created_at
    `

    const row = result.rows[0]

    console.info('[user][api-keys][POST]', { requestId, login, keyPrefix, name })

    return ok(requestId, {
      id: row.id,
      keyPrefix,
      name,
      createdAt: row.created_at,
      plainTextKey: rawKey
    })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[user][api-keys][POST]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to generate API key.')
  }
}

export async function DELETE(request: NextRequest) {
  const requestId = createRequestId()

  try {
    const session = await getAuthSession()
    const login = session?.user?.login?.trim()

    if (!login) {
      return fail(requestId, 401, 'UNAUTHORIZED', 'Authentication required.')
    }

    const id = request.nextUrl.searchParams.get('id')

    if (!id) {
      return fail(requestId, 400, 'INVALID_INPUT', 'Key id is required.')
    }

    await ensureUserAutomationSchema()

    const result = await sql`
      UPDATE user_api_keys SET is_active = FALSE
      WHERE id = ${id} AND user_login = ${login}
    `

    if (result.rowCount === 0) {
      return fail(requestId, 404, 'NOT_FOUND', 'API key not found or already revoked.')
    }

    return ok(requestId, { success: true })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return fail(requestId, error.status, error.code, error.message, error.extra)
    }
    console.error('[user][api-keys][DELETE]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to revoke API key.')
  }
}
