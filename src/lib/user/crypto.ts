import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { AdminHttpError } from '@/lib/admin/errors'

type EncryptedSecretPayload = {
  encryptedKey: string
  iv: string
  authTag: string
  keyVersion: number
  keyFingerprint: string
}

const KEY_VERSION = 1

function getEncryptionKey(): Buffer {
  const raw = (process.env.USER_AI_ENCRYPTION_KEY || '').trim()
  if (!raw) {
    throw new AdminHttpError(500, 'USER_AI_ENCRYPTION_KEY_MISSING', 'USER_AI_ENCRYPTION_KEY is not configured.')
  }

  let key: Buffer
  try {
    key = Buffer.from(raw, 'base64')
  } catch {
    throw new AdminHttpError(500, 'USER_AI_ENCRYPTION_KEY_INVALID', 'USER_AI_ENCRYPTION_KEY must be base64-encoded.')
  }

  if (key.length !== 32) {
    throw new AdminHttpError(500, 'USER_AI_ENCRYPTION_KEY_INVALID', 'USER_AI_ENCRYPTION_KEY must decode to 32 bytes.')
  }

  return key
}

function toFingerprint(secret: string): string {
  const trimmed = secret.trim()
  if (!trimmed) {
    return '****'
  }
  return `****${trimmed.slice(-4)}`
}

export function encryptUserApiKey(secret: string): EncryptedSecretPayload {
  const plaintext = secret.trim()
  if (!plaintext) {
    throw new AdminHttpError(400, 'INVALID_INPUT', 'apiKey is required.')
  }

  const key = getEncryptionKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return {
    encryptedKey: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    keyVersion: KEY_VERSION,
    keyFingerprint: toFingerprint(plaintext)
  }
}

export function decryptUserApiKey(input: {
  encryptedKey: string
  iv: string
  authTag: string
  keyVersion: number
}): string {
  if (input.keyVersion !== KEY_VERSION) {
    throw new AdminHttpError(500, 'USER_AI_KEY_VERSION_UNSUPPORTED', `Unsupported key version: ${input.keyVersion}`)
  }

  const key = getEncryptionKey()
  const iv = Buffer.from(input.iv, 'base64')
  const authTag = Buffer.from(input.authTag, 'base64')
  const encrypted = Buffer.from(input.encryptedKey, 'base64')

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8').trim()
    if (!plain) {
      throw new Error('empty secret')
    }
    return plain
  } catch (error) {
    throw new AdminHttpError(500, 'USER_AI_KEY_DECRYPT_FAILED', error instanceof Error ? error.message : 'Failed to decrypt user API key.')
  }
}

