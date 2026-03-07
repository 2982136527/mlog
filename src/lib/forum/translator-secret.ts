import crypto from 'node:crypto'
import { AdminHttpError } from '@/lib/admin/errors'
import type { ForumTranslatorProfile } from '@/types/forum'

const GITHUB_API_BASE = 'https://api.github.com'
const GIST_FILENAME = 'mlog-forum-secrets.json'
const GIST_DESCRIPTION_PREFIX = 'MLog forum translator secrets'
const KEY_VERSION = 1
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro'

type GithubGistListItem = {
  id: string
  description: string | null
  files?: Record<
    string,
    {
      filename?: string
    }
  >
}

type GithubGistDetail = {
  id: string
  files?: Record<
    string,
    {
      filename?: string
      content?: string
    }
  >
}

type StoredGeminiSecret = {
  encryptedKey: string
  iv: string
  authTag: string
  keyVersion: number
  keyFingerprint: string
  model: string
  updatedAt: string
}

type StoredSecretsPayload = {
  version: number
  gemini?: StoredGeminiSecret
}

function parseJsonSafe(input: string): unknown {
  try {
    return JSON.parse(input)
  } catch {
    return null
  }
}

function buildHeaders(accessToken: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${accessToken}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  }
}

async function githubRequest<T>(input: {
  path: string
  accessToken: string
  init?: RequestInit
}): Promise<T> {
  const response = await fetch(`${GITHUB_API_BASE}${input.path}`, {
    ...input.init,
    headers: {
      ...buildHeaders(input.accessToken),
      ...(input.init?.headers || {})
    },
    cache: 'no-store'
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    const message = body.slice(0, 220) || `GitHub API request failed with status ${response.status}.`
    throw new AdminHttpError(502, 'FORUM_UPSTREAM_FAILED', message, {
      status: response.status
    })
  }

  if (response.status === 204) {
    return {} as T
  }

  return (await response.json()) as T
}

function isTargetSecretGist(item: GithubGistListItem): boolean {
  const files = item.files || {}
  const hasFile = Object.values(files).some(file => (file.filename || '').trim() === GIST_FILENAME)
  if (!hasFile) {
    return false
  }

  const desc = (item.description || '').toLowerCase()
  return desc.startsWith(GIST_DESCRIPTION_PREFIX.toLowerCase())
}

async function findSecretGistId(accessToken: string): Promise<string | null> {
  const list = await githubRequest<GithubGistListItem[]>({
    path: '/gists?per_page=100',
    accessToken
  })
  const found = list.find(isTargetSecretGist)
  return found?.id || null
}

function normalizeStoredPayload(raw: unknown): StoredSecretsPayload {
  if (!raw || typeof raw !== 'object') {
    return {
      version: 1
    }
  }

  const parsed = raw as {
    version?: unknown
    gemini?: Partial<StoredGeminiSecret>
  }

  const model = typeof parsed.gemini?.model === 'string' && parsed.gemini.model.trim() ? parsed.gemini.model.trim() : DEFAULT_GEMINI_MODEL
  const updatedAt = typeof parsed.gemini?.updatedAt === 'string' ? parsed.gemini.updatedAt : null

  const hasGeminiSecret =
    typeof parsed.gemini?.encryptedKey === 'string' &&
    typeof parsed.gemini?.iv === 'string' &&
    typeof parsed.gemini?.authTag === 'string' &&
    typeof parsed.gemini?.keyFingerprint === 'string'

  return {
    version: Number.isFinite(Number(parsed.version)) ? Number(parsed.version) : 1,
    gemini: hasGeminiSecret
      ? {
          encryptedKey: parsed.gemini!.encryptedKey!,
          iv: parsed.gemini!.iv!,
          authTag: parsed.gemini!.authTag!,
          keyVersion: Number.isFinite(Number(parsed.gemini?.keyVersion)) ? Number(parsed.gemini!.keyVersion) : KEY_VERSION,
          keyFingerprint: parsed.gemini!.keyFingerprint!,
          model,
          updatedAt: updatedAt || new Date().toISOString()
        }
      : undefined
  }
}

async function readStoredSecrets(input: {
  accessToken: string
}): Promise<{
  gistId: string | null
  payload: StoredSecretsPayload
}> {
  const gistId = await findSecretGistId(input.accessToken)
  if (!gistId) {
    return {
      gistId: null,
      payload: {
        version: 1
      }
    }
  }

  const detail = await githubRequest<GithubGistDetail>({
    path: `/gists/${gistId}`,
    accessToken: input.accessToken
  })
  const content = detail.files?.[GIST_FILENAME]?.content || ''
  const payload = normalizeStoredPayload(parseJsonSafe(content))

  return {
    gistId,
    payload
  }
}

async function createSecretGist(input: {
  accessToken: string
  login: string
  content: string
}): Promise<string> {
  const created = await githubRequest<{ id: string }>({
    path: '/gists',
    accessToken: input.accessToken,
    init: {
      method: 'POST',
      body: JSON.stringify({
        description: `${GIST_DESCRIPTION_PREFIX} for @${input.login}`,
        public: false,
        files: {
          [GIST_FILENAME]: {
            content: input.content
          }
        }
      })
    }
  })

  return created.id
}

async function updateSecretGist(input: {
  accessToken: string
  gistId: string
  content: string
}): Promise<void> {
  await githubRequest({
    path: `/gists/${input.gistId}`,
    accessToken: input.accessToken,
    init: {
      method: 'PATCH',
      body: JSON.stringify({
        files: {
          [GIST_FILENAME]: {
            content: input.content
          }
        }
      })
    }
  })
}

function resolveEncryptionKey(): Buffer {
  const raw = (process.env.USER_SECRET_ENCRYPTION_KEY || process.env.USER_AI_ENCRYPTION_KEY || '').trim()
  if (!raw) {
    throw new AdminHttpError(500, 'FORUM_ENCRYPTION_MISCONFIGURED', 'USER_SECRET_ENCRYPTION_KEY is not configured.')
  }

  let key: Buffer
  try {
    key = Buffer.from(raw, 'base64')
  } catch {
    throw new AdminHttpError(500, 'FORUM_ENCRYPTION_MISCONFIGURED', 'USER_SECRET_ENCRYPTION_KEY must be a valid base64 string.')
  }

  if (key.length !== 32) {
    throw new AdminHttpError(500, 'FORUM_ENCRYPTION_MISCONFIGURED', 'USER_SECRET_ENCRYPTION_KEY must decode to 32 bytes.')
  }

  return key
}

function hashFingerprint(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 12)
}

function encryptSecret(plainText: string): {
  encryptedKey: string
  iv: string
  authTag: string
  keyVersion: number
  keyFingerprint: string
} {
  const key = resolveEncryptionKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return {
    encryptedKey: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    keyVersion: KEY_VERSION,
    keyFingerprint: hashFingerprint(plainText)
  }
}

function decryptSecret(input: StoredGeminiSecret): string {
  const key = resolveEncryptionKey()
  const iv = Buffer.from(input.iv, 'base64')
  const authTag = Buffer.from(input.authTag, 'base64')
  const encrypted = Buffer.from(input.encryptedKey, 'base64')

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}

function sanitizeModel(value: string | null | undefined): string {
  const model = (value || '').trim()
  if (!model) {
    return DEFAULT_GEMINI_MODEL
  }
  return model.slice(0, 120)
}

function toProfile(payload: StoredSecretsPayload): ForumTranslatorProfile {
  return {
    hasGeminiKey: Boolean(payload.gemini),
    model: payload.gemini?.model || DEFAULT_GEMINI_MODEL,
    updatedAt: payload.gemini?.updatedAt || null
  }
}

async function persistStoredSecrets(input: {
  accessToken: string
  login: string
  gistId: string | null
  payload: StoredSecretsPayload
}): Promise<void> {
  const content = JSON.stringify(input.payload, null, 2)
  if (!input.gistId) {
    await createSecretGist({
      accessToken: input.accessToken,
      login: input.login,
      content
    })
    return
  }

  await updateSecretGist({
    accessToken: input.accessToken,
    gistId: input.gistId,
    content
  })
}

export function hasGistScope(scope: string | null | undefined): boolean {
  if (!scope) {
    return false
  }
  return scope
    .split(/[\s,]+/)
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
    .includes('gist')
}

export async function getForumTranslatorProfile(input: {
  accessToken: string
}): Promise<ForumTranslatorProfile> {
  const stored = await readStoredSecrets({
    accessToken: input.accessToken
  })
  return toProfile(stored.payload)
}

export async function upsertForumGeminiSecret(input: {
  accessToken: string
  login: string
  apiKey: string
  model?: string | null
}): Promise<ForumTranslatorProfile> {
  const apiKey = input.apiKey.trim()
  if (!apiKey) {
    throw new AdminHttpError(400, 'FORUM_INVALID_INPUT', 'Gemini API key is required.')
  }

  const stored = await readStoredSecrets({
    accessToken: input.accessToken
  })
  const encrypted = encryptSecret(apiKey)
  const model = sanitizeModel(input.model)
  const nextPayload: StoredSecretsPayload = {
    version: stored.payload.version,
    gemini: {
      ...encrypted,
      model,
      updatedAt: new Date().toISOString()
    }
  }

  await persistStoredSecrets({
    accessToken: input.accessToken,
    login: input.login,
    gistId: stored.gistId,
    payload: nextPayload
  })

  return toProfile(nextPayload)
}

export async function deleteForumGeminiSecret(input: {
  accessToken: string
  login: string
}): Promise<ForumTranslatorProfile> {
  const stored = await readStoredSecrets({
    accessToken: input.accessToken
  })
  const nextPayload: StoredSecretsPayload = {
    version: stored.payload.version
  }

  await persistStoredSecrets({
    accessToken: input.accessToken,
    login: input.login,
    gistId: stored.gistId,
    payload: nextPayload
  })

  return toProfile(nextPayload)
}

export async function resolveForumGeminiSecret(input: {
  accessToken: string
  login: string
  apiKey?: string | null
  model?: string | null
}): Promise<{
  apiKey: string | null
  model: string
  profile: ForumTranslatorProfile
}> {
  const providedApiKey = (input.apiKey || '').trim()
  if (providedApiKey) {
    const profile = await upsertForumGeminiSecret({
      accessToken: input.accessToken,
      login: input.login,
      apiKey: providedApiKey,
      model: input.model
    })
    return {
      apiKey: providedApiKey,
      model: profile.model,
      profile
    }
  }

  const stored = await readStoredSecrets({
    accessToken: input.accessToken
  })
  if (!stored.payload.gemini) {
    const profile = toProfile(stored.payload)
    return {
      apiKey: null,
      model: profile.model,
      profile
    }
  }

  let decrypted: string
  try {
    decrypted = decryptSecret(stored.payload.gemini)
  } catch {
    throw new AdminHttpError(500, 'FORUM_ENCRYPTION_MISCONFIGURED', 'Failed to decrypt saved Gemini key.')
  }

  return {
    apiKey: decrypted,
    model: sanitizeModel(input.model || stored.payload.gemini.model),
    profile: toProfile(stored.payload)
  }
}
