import { describe, expect, it } from 'vitest'
import { readMediaConfig } from './config'
import { MediaError } from './errors'

const baseEnv = {
  IMAGE_GITHUB_OWNER: 'example-owner',
  IMAGE_GITHUB_REPO: 'images.repo',
  IMAGE_GITHUB_BRANCH: 'media/main',
  IMAGE_GITHUB_TOKEN: 'github_pat_test-only'
}

describe('readMediaConfig', () => {
  it('reads MPic-compatible GitHub variables with safe defaults', () => {
    const config = readMediaConfig(baseEnv)

    expect(config).toMatchObject({
      github: {
        owner: 'example-owner',
        repo: 'images.repo',
        branch: 'media/main',
        token: 'github_pat_test-only'
      },
      pathPrefix: 'uploads/blog',
      requestTimeoutMs: 8_000,
      maxRetries: 2,
      maxRepositoryBytes: Math.floor(3.5 * 1024 * 1024 * 1024)
    })
    expect(config.cdnBaseUrl).toBeUndefined()
  })

  it('validates an explicit repository capacity threshold', () => {
    expect(readMediaConfig({
      ...baseEnv,
      IMAGE_GITHUB_MAX_REPOSITORY_BYTES: String(500 * 1024 * 1024)
    }).maxRepositoryBytes).toBe(500 * 1024 * 1024)
    expect(() => readMediaConfig({ ...baseEnv, IMAGE_GITHUB_MAX_REPOSITORY_BYTES: '1024' })).toThrow(MediaError)
  })

  it('normalizes a custom path prefix and HTTPS CDN base path', () => {
    const config = readMediaConfig({
      ...baseEnv,
      IMAGE_GITHUB_PATH_PREFIX: '/assets/mlog/',
      NEXT_PUBLIC_CDN_BASE_URL: 'https://img.example.com/public/'
    })

    expect(config.pathPrefix).toBe('assets/mlog')
    expect(config.cdnBaseUrl).toBe('https://img.example.com/public')
  })

  it.each([
    ['unsafe prefix', { ...baseEnv, IMAGE_GITHUB_PATH_PREFIX: '../private' }],
    ['invalid branch', { ...baseEnv, IMAGE_GITHUB_BRANCH: 'main..backup' }],
    ['plain HTTP CDN', { ...baseEnv, NEXT_PUBLIC_CDN_BASE_URL: 'http://img.example.com' }],
    ['loopback CDN', { ...baseEnv, NEXT_PUBLIC_CDN_BASE_URL: 'https://127.0.0.1/media' }],
    ['CDN traversal', { ...baseEnv, NEXT_PUBLIC_CDN_BASE_URL: 'https://img.example.com/a/../private' }]
  ])('rejects %s', (_label, env) => {
    expect(() => readMediaConfig(env)).toThrow(MediaError)
  })

  it('never includes a token value in configuration errors', () => {
    const token = 'secret-token-that-must-not-appear'
    // Token validation is now done at upload time, not config time.
    // This test verifies that a different field's error doesn't leak the token.
    try {
      readMediaConfig({ ...baseEnv, IMAGE_GITHUB_BRANCH: 'main..backup', IMAGE_GITHUB_TOKEN: `${token}\n` })
      throw new Error('expected invalid configuration')
    } catch (error) {
      expect(error).toBeInstanceOf(MediaError)
      expect((error as Error).message).not.toContain(token)
    }
  })
})
