import { randomUUID } from 'node:crypto'
import type { AiProvider } from '@/types/admin'
import type { UserAiProvider, UserAiProviderInput } from '@/types/user'
import { AdminHttpError } from '@/lib/admin/errors'
import { decryptUserApiKey, encryptUserApiKey } from '@/lib/user/crypto'
import { requireActiveUserProfile } from '@/lib/user/profile'
import { sql } from '@/lib/user/db'

const PROVIDERS: AiProvider[] = ['gemini', 'openai', 'deepseek', 'qwen']

function isAiProvider(value: string): value is AiProvider {
  return PROVIDERS.includes(value as AiProvider)
}

function normalizeProvider(input: string): AiProvider {
  const value = input.trim().toLowerCase()
  if (!isAiProvider(value)) {
    throw new AdminHttpError(400, 'INVALID_INPUT', `Unsupported provider: ${input}`)
  }
  return value
}

function normalizeModel(input: string): string {
  const value = input.trim()
  if (!value) {
    throw new AdminHttpError(400, 'INVALID_INPUT', 'model is required.')
  }
  return value.slice(0, 160)
}

function normalizeBaseUrl(input?: string): string | null {
  const value = (input || '').trim()
  if (!value) {
    return null
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new AdminHttpError(400, 'INVALID_INPUT', 'baseUrl must be a valid URL.')
  }

  if (!/^https?:$/.test(url.protocol)) {
    throw new AdminHttpError(400, 'INVALID_INPUT', 'baseUrl must use http/https protocol.')
  }

  return value.replace(/\/+$/, '')
}

function mapProvider(row: {
  id: string
  provider: string
  model: string
  base_url: string | null
  key_fingerprint: string
  enabled: boolean
  created_at: string
  updated_at: string
}): UserAiProvider {
  return {
    id: row.id,
    provider: normalizeProvider(row.provider),
    model: row.model,
    baseUrl: row.base_url,
    keyFingerprint: row.key_fingerprint,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export async function listUserAiProviders(login: string): Promise<UserAiProvider[]> {
  await requireActiveUserProfile(login)
  const result = await sql<{
    id: string
    provider: string
    model: string
    base_url: string | null
    key_fingerprint: string
    enabled: boolean
    created_at: string
    updated_at: string
  }>`
    SELECT id, provider, model, base_url, key_fingerprint, enabled, created_at::text, updated_at::text
    FROM user_ai_providers
    WHERE user_login = ${login}
    ORDER BY created_at DESC
  `
  return result.rows.map(mapProvider)
}

export async function createUserAiProvider(login: string, input: UserAiProviderInput): Promise<UserAiProvider> {
  await requireActiveUserProfile(login)
  const provider = normalizeProvider(input.provider)
  const model = normalizeModel(input.model)
  const baseUrl = normalizeBaseUrl(input.baseUrl)
  const secret = encryptUserApiKey(input.apiKey)
  const id = randomUUID()
  const enabled = input.enabled !== false

  await sql`
    INSERT INTO user_ai_providers (
      id, user_login, provider, model, base_url,
      encrypted_key, iv, auth_tag, key_version, key_fingerprint, enabled
    ) VALUES (
      ${id}, ${login}, ${provider}, ${model}, ${baseUrl},
      ${secret.encryptedKey}, ${secret.iv}, ${secret.authTag}, ${secret.keyVersion}, ${secret.keyFingerprint}, ${enabled}
    )
  `

  const created = await getUserAiProviderById(login, id)
  if (!created) {
    throw new AdminHttpError(500, 'INTERNAL_ERROR', 'Failed to load created provider.')
  }
  return created
}

export async function updateUserAiProvider(
  login: string,
  id: string,
  input: Partial<UserAiProviderInput> & { enabled?: boolean }
): Promise<UserAiProvider> {
  await requireActiveUserProfile(login)
  const existing = await getUserAiProviderRaw(login, id)
  if (!existing) {
    throw new AdminHttpError(404, 'NOT_FOUND', 'Provider not found.')
  }

  const provider = input.provider ? normalizeProvider(input.provider) : normalizeProvider(existing.provider)
  const model = input.model ? normalizeModel(input.model) : existing.model
  const baseUrl = input.baseUrl !== undefined ? normalizeBaseUrl(input.baseUrl) : existing.base_url
  const enabled = input.enabled === undefined ? existing.enabled : Boolean(input.enabled)

  const encrypted = input.apiKey ? encryptUserApiKey(input.apiKey) : null

  await sql`
    UPDATE user_ai_providers
    SET provider = ${provider},
        model = ${model},
        base_url = ${baseUrl},
        enabled = ${enabled},
        encrypted_key = ${encrypted?.encryptedKey || existing.encrypted_key},
        iv = ${encrypted?.iv || existing.iv},
        auth_tag = ${encrypted?.authTag || existing.auth_tag},
        key_version = ${encrypted?.keyVersion || existing.key_version},
        key_fingerprint = ${encrypted?.keyFingerprint || existing.key_fingerprint},
        updated_at = NOW()
    WHERE id = ${id} AND user_login = ${login}
  `

  const updated = await getUserAiProviderById(login, id)
  if (!updated) {
    throw new AdminHttpError(500, 'INTERNAL_ERROR', 'Failed to load updated provider.')
  }
  return updated
}

export async function deleteUserAiProvider(login: string, id: string): Promise<void> {
  await requireActiveUserProfile(login)
  const jobsRef = await sql<{ count: string }>`
    SELECT COUNT(*)::text AS count
    FROM user_automation_jobs
    WHERE user_login = ${login} AND provider_id = ${id}
  `
  if (Number(jobsRef.rows[0]?.count || '0') > 0) {
    throw new AdminHttpError(409, 'CONFLICT', 'Provider is in use by existing automation jobs.')
  }

  const removed = await sql`
    DELETE FROM user_ai_providers
    WHERE id = ${id} AND user_login = ${login}
  `
  if (removed.rowCount === 0) {
    throw new AdminHttpError(404, 'NOT_FOUND', 'Provider not found.')
  }
}

async function getUserAiProviderRaw(login: string, id: string) {
  const result = await sql<{
    id: string
    provider: string
    model: string
    base_url: string | null
    encrypted_key: string
    iv: string
    auth_tag: string
    key_version: number
    key_fingerprint: string
    enabled: boolean
  }>`
    SELECT id, provider, model, base_url, encrypted_key, iv, auth_tag, key_version, key_fingerprint, enabled
    FROM user_ai_providers
    WHERE id = ${id} AND user_login = ${login}
    LIMIT 1
  `
  return result.rows[0] || null
}

export async function getUserAiProviderForRuntime(login: string, id: string): Promise<{
  id: string
  provider: AiProvider
  model: string
  baseUrl: string | null
  apiKey: string
}> {
  await requireActiveUserProfile(login)
  const row = await getUserAiProviderRaw(login, id)
  if (!row) {
    throw new AdminHttpError(404, 'NOT_FOUND', 'Provider not found.')
  }
  if (!row.enabled) {
    throw new AdminHttpError(400, 'INVALID_INPUT', 'Provider is disabled.')
  }

  return {
    id: row.id,
    provider: normalizeProvider(row.provider),
    model: row.model,
    baseUrl: row.base_url,
    apiKey: decryptUserApiKey({
      encryptedKey: row.encrypted_key,
      iv: row.iv,
      authTag: row.auth_tag,
      keyVersion: row.key_version
    })
  }
}

export async function getUserAiProviderById(login: string, id: string): Promise<UserAiProvider | null> {
  await requireActiveUserProfile(login)
  const result = await sql<{
    id: string
    provider: string
    model: string
    base_url: string | null
    key_fingerprint: string
    enabled: boolean
    created_at: string
    updated_at: string
  }>`
    SELECT id, provider, model, base_url, key_fingerprint, enabled, created_at::text, updated_at::text
    FROM user_ai_providers
    WHERE user_login = ${login} AND id = ${id}
    LIMIT 1
  `
  const row = result.rows[0]
  return row ? mapProvider(row) : null
}

