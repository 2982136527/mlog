import { createHash } from 'node:crypto'
import { sql } from '@vercel/postgres'
import { AdminHttpError } from '@/lib/admin/errors'
import { ensureUserAutomationSchema } from '@/lib/user/db'
import type { NextRequest } from 'next/server'

export class AgentAuthError extends AdminHttpError {
  constructor(message?: string) {
    super(401, 'AGENT_AUTH_FAILED', message || 'Invalid or missing API key.')
  }
}

export async function validateAgentRequest(request: NextRequest): Promise<string> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    throw new AgentAuthError('Missing Authorization header. Use: Authorization: Bearer <your-api-key>')
  }

  const [scheme, token] = authHeader.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new AgentAuthError('Invalid Authorization header format. Use: Authorization: Bearer <your-api-key>')
  }

  const keyHash = createHash('sha256').update(token).digest('hex')

  await ensureUserAutomationSchema()

  const result = await sql<{ user_login: string }>`
    SELECT user_login FROM user_api_keys
    WHERE key_hash = ${keyHash} AND is_active = TRUE
    LIMIT 1
  `

  const row = result.rows[0]
  if (!row) {
    throw new AgentAuthError('Invalid or revoked API key.')
  }

  sql`UPDATE user_api_keys SET last_used_at = NOW() WHERE key_hash = ${keyHash}`.catch(() => {})

  return row.user_login
}
