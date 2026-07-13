import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { MediaConfig } from './config'
import { MediaError } from './errors'
import { GitHubMediaStorage, githubMediaInternals } from './github-provider'

const config: MediaConfig = {
  github: {
    owner: 'owner',
    repo: 'images',
    branch: 'main',
    token: 'never-log-this-token'
  },
  pathPrefix: 'uploads/blog',
  cdnBaseUrl: 'https://img.example.com/base',
  requestTimeoutMs: 1_000,
  maxRetries: 2,
  rotationThreshold: 0,
  repoPrefix: 'test-images',
  limits: {
    maxInputBytes: 1_000,
    maxOutputBytes: 1_000,
    maxWidth: 100,
    maxHeight: 100,
    maxPixelsPerFrame: 10_000,
    maxTotalPixels: 10_000,
    maxFrames: 10
  }
}

function uploadInput(buffer = Buffer.from('normalized-image')) {
  const hash = createHash('sha256').update(buffer).digest('hex')
  return {
    path: `uploads/blog/${hash.slice(0, 2)}/${hash}.png`,
    buffer,
    mimeType: 'image/png' as const,
    sha256: hash,
    requestId: 'request-1'
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

describe('GitHubMediaStorage', () => {
  it('creates a new content-addressed object without exposing the token', async () => {
    const input = uploadInput()
    const blobSha = githubMediaInternals.gitBlobSha(input.buffer)
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({}, 404))
      .mockResolvedValueOnce(jsonResponse({ content: { sha: blobSha } }, 201))
    const logger = { warn: vi.fn() }
    const storage = new GitHubMediaStorage(config, { fetch: fetchMock, logger })

    await expect(storage.put(input)).resolves.toEqual({
      path: input.path,
      provider: 'github',
      created: true,
      providerObjectId: blobSha
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const putInit = fetchMock.mock.calls[1][1]
    expect(putInit?.method).toBe('PUT')
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(config.github.token)
  })

  it('returns an existing identical Git blob without writing again', async () => {
    const input = uploadInput()
    const blobSha = githubMediaInternals.gitBlobSha(input.buffer)
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ type: 'file', sha: blobSha })
    )
    const storage = new GitHubMediaStorage(config, { fetch: fetchMock })

    await expect(storage.put(input)).resolves.toMatchObject({ created: false, providerObjectId: blobSha })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('reconciles a concurrent PUT conflict by verifying the resulting blob', async () => {
    const input = uploadInput()
    const blobSha = githubMediaInternals.gitBlobSha(input.buffer)
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({}, 404))
      .mockResolvedValueOnce(jsonResponse({}, 409))
      .mockResolvedValueOnce(jsonResponse({ type: 'file', sha: blobSha }))
    const storage = new GitHubMediaStorage(config, { fetch: fetchMock, sleep: vi.fn() })

    await expect(storage.put(input)).resolves.toMatchObject({ created: false, providerObjectId: blobSha })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('retries the PUT when an unrelated concurrent commit caused the conflict', async () => {
    const input = uploadInput()
    const blobSha = githubMediaInternals.gitBlobSha(input.buffer)
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({}, 404))
      .mockResolvedValueOnce(jsonResponse({}, 409))
      .mockResolvedValueOnce(jsonResponse({}, 404))
      .mockResolvedValueOnce(jsonResponse({ content: { sha: blobSha } }, 201))
    const sleep = vi.fn().mockResolvedValue(undefined)
    const storage = new GitHubMediaStorage(config, { fetch: fetchMock, sleep })

    await expect(storage.put(input)).resolves.toMatchObject({ created: true, providerObjectId: blobSha })
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(2)
    expect(sleep).toHaveBeenCalledOnce()
  })

  it('rejects a hash collision instead of overwriting an existing object', async () => {
    const input = uploadInput()
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ type: 'file', sha: 'different-git-blob-sha' })
    )
    const storage = new GitHubMediaStorage(config, { fetch: fetchMock })

    await expect(storage.put(input)).rejects.toMatchObject({
      code: 'MEDIA_STORAGE_CONFLICT',
      status: 409
    })
  })

  it('fails closed before PUT when the repository reaches its safe capacity', async () => {
    const input = uploadInput(Buffer.alloc(600, 1))
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({}, 404))
      .mockResolvedValueOnce(jsonResponse({ size: 1 }))
    const storage = new GitHubMediaStorage({ ...config, maxRepositoryBytes: 1_500 }, { fetch: fetchMock })

    await expect(storage.put(input)).rejects.toMatchObject({
      status: 507,
      code: 'MEDIA_REPOSITORY_CAPACITY_EXCEEDED'
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
  })

  it('rejects a caller-supplied path that is not content-addressed', async () => {
    const input = { ...uploadInput(), path: 'uploads/blog/aa/not-the-content-hash.png' }
    const fetchMock = vi.fn<typeof fetch>()
    const storage = new GitHubMediaStorage(config, { fetch: fetchMock })

    await expect(storage.put(input)).rejects.toMatchObject({ code: 'MEDIA_INVALID_INPUT', status: 400 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retries transient GitHub responses and logs only bounded context', async () => {
    const input = uploadInput()
    const blobSha = githubMediaInternals.gitBlobSha(input.buffer)
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ message: config.github.token }, 502))
      .mockResolvedValueOnce(jsonResponse({}, 404))
      .mockResolvedValueOnce(jsonResponse({ content: { sha: blobSha } }, 201))
    const logger = { warn: vi.fn() }
    const sleep = vi.fn().mockResolvedValue(undefined)
    const storage = new GitHubMediaStorage(config, { fetch: fetchMock, logger, sleep })

    await storage.put(input)

    expect(sleep).toHaveBeenCalledOnce()
    expect(logger.warn).toHaveBeenCalledWith('[media][github] retry', expect.objectContaining({
      operation: 'get',
      status: 502,
      attempt: 1
    }))
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(config.github.token)
  })

  it('does not copy sensitive GitHub response bodies into MediaError', async () => {
    const input = uploadInput()
    const upstreamSecret = 'sensitive-upstream-detail'
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ message: upstreamSecret }, 502)
    )
    const storage = new GitHubMediaStorage(config, {
      fetch: fetchMock,
      sleep: vi.fn(),
      logger: { warn: vi.fn() }
    })

    try {
      await storage.put(input)
      throw new Error('expected upload failure')
    } catch (error) {
      expect(error).toBeInstanceOf(MediaError)
      expect((error as Error).message).not.toContain(upstreamSecret)
      expect((error as Error).message).not.toContain(config.github.token)
    }
  })

  it('aborts a timed-out request and fails closed without contacting a real host', async () => {
    vi.useFakeTimers()
    const input = uploadInput()
    const timeoutConfig = { ...config, requestTimeoutMs: 10, maxRetries: 0 }
    const fetchMock = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    }))
    const storage = new GitHubMediaStorage(timeoutConfig, { fetch: fetchMock })

    try {
      const result = expect(storage.put(input)).rejects.toMatchObject({
        code: 'MEDIA_STORAGE_UNAVAILABLE',
        retryable: true
      })
      await vi.advanceTimersByTimeAsync(10)
      await result
    } finally {
      vi.useRealTimers()
    }
  })

  it('builds stable URL candidates and probes them without authentication', async () => {
    const input = uploadInput()
    const fetchMock = vi.fn<typeof fetch>(async url => {
      const value = String(url)
      return new Response(null, { status: value.includes('cdn.jsdelivr.net') ? 200 : 404 })
    })
    const storage = new GitHubMediaStorage(config, { fetch: fetchMock })

    const candidates = storage.buildCandidates(input.path)
    const availability = await storage.probe(input.path, input.requestId)

    expect(candidates.map(candidate => candidate.kind)).toEqual(['custom-cdn', 'jsdelivr', 'github-raw'])
    expect(candidates[0].url).toContain(`https://img.example.com/base/${input.path}`)
    expect(availability).toMatchObject({ available: true, candidateKind: 'jsdelivr' })
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init?.headers).has('Authorization')).toBe(false)
    }
  })

  it('deletes with the current Git blob SHA and treats a repeated 404 as success', async () => {
    const input = uploadInput()
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ type: 'file', sha: 'current-blob-sha' }))
      .mockResolvedValueOnce(jsonResponse({}, 200))
      .mockResolvedValueOnce(jsonResponse({}, 404))
    const storage = new GitHubMediaStorage(config, { fetch: fetchMock })

    await expect(storage.delete({
      path: input.path,
      expectedSha256: input.sha256,
      requestId: input.requestId
    })).resolves.toMatchObject({ deleted: true, path: input.path })
    const deleteInit = fetchMock.mock.calls[1][1]
    expect(deleteInit?.method).toBe('DELETE')
    expect(JSON.parse(String(deleteInit?.body))).toMatchObject({
      sha: 'current-blob-sha',
      branch: 'main'
    })

    await expect(storage.delete({
      path: input.path,
      expectedSha256: input.sha256,
      requestId: input.requestId
    })).resolves.toMatchObject({ deleted: false, path: input.path })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('rejects a delete hash/path mismatch before calling GitHub', async () => {
    const input = uploadInput()
    const fetchMock = vi.fn<typeof fetch>()
    const storage = new GitHubMediaStorage(config, { fetch: fetchMock })

    await expect(storage.delete({
      path: input.path,
      expectedSha256: 'a'.repeat(64),
      requestId: input.requestId
    })).rejects.toMatchObject({ code: 'MEDIA_INVALID_INPUT', status: 400 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reconciles a concurrent delete conflict when the object is already gone', async () => {
    const input = uploadInput()
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ type: 'file', sha: 'current-blob-sha' }))
      .mockResolvedValueOnce(jsonResponse({}, 409))
      .mockResolvedValueOnce(jsonResponse({}, 404))
    const storage = new GitHubMediaStorage(config, { fetch: fetchMock })

    await expect(storage.delete({
      path: input.path,
      expectedSha256: input.sha256,
      requestId: input.requestId
    })).resolves.toMatchObject({ deleted: false })
  })
})
