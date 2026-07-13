import 'server-only'
import { createHash } from 'node:crypto'
import { assertMediaObjectPath, type MediaConfig } from './config'
import { MediaError } from './errors'
import type {
  DeletedMediaObject,
  DeleteMediaObjectInput,
  MediaStorage,
  PutMediaObjectInput,
  StoredMediaObject
} from './storage'
import type { MediaAvailability, MediaCandidate } from './types'

const GITHUB_API_BASE = 'https://api.github.com'
const TRANSIENT_STATUSES = new Set([408, 429, 500, 502, 503, 504])
const EXTENSION_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
} as const

type FetchLike = typeof fetch

type MediaLogger = {
  warn: (event: string, context: Record<string, string | number>) => void
}

type GithubProviderDependencies = {
  fetch?: FetchLike
  sleep?: (milliseconds: number) => Promise<void>
  logger?: MediaLogger
}

type GithubContentResponse = {
  type?: string
  sha?: string
}

type GithubPutResponse = {
  content?: {
    sha?: string
  }
}

type GithubRepositoryResponse = {
  size?: number
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

const defaultLogger: MediaLogger = {
  warn(event, context) {
    console.warn(event, context)
  }
}

function encodeSegments(input: string): string {
  return input.split('/').map(encodeURIComponent).join('/')
}

function gitBlobSha(buffer: Buffer): string {
  const header = Buffer.from(`blob ${buffer.length}\0`, 'utf8')
  return createHash('sha1').update(header).update(buffer).digest('hex')
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

function normalizeRequestId(requestId: string): string {
  return requestId.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 80) || 'unknown'
}

function retryDelay(response: Response | null, attempt: number): number {
  const retryAfter = Number(response?.headers.get('retry-after'))
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1_000, 2_000)
  }
  return Math.min(200 * (2 ** attempt), 2_000)
}

function appendUrlPath(baseUrl: string, path: string): string {
  const encodedPath = encodeSegments(path)
  return `${baseUrl.replace(/\/$/, '')}/${encodedPath}`
}

export class GitHubMediaStorage implements MediaStorage {
  readonly provider = 'github' as const

  private readonly fetchImpl: FetchLike
  private readonly sleep: (milliseconds: number) => Promise<void>
  private readonly logger: MediaLogger

  constructor(
    private readonly config: MediaConfig,
    dependencies: GithubProviderDependencies = {}
  ) {
    this.fetchImpl = dependencies.fetch || fetch
    this.sleep = dependencies.sleep || defaultSleep
    this.logger = dependencies.logger || defaultLogger
  }

  buildCandidates(path: string): MediaCandidate[] {
    assertMediaObjectPath(path, this.config.pathPrefix)
    const { owner, repo, branch } = this.config.github
    const candidates: MediaCandidate[] = []
    if (this.config.cdnBaseUrl) {
      candidates.push({
        kind: 'custom-cdn',
        url: appendUrlPath(this.config.cdnBaseUrl, path)
      })
    }
    candidates.push({
      kind: 'jsdelivr',
      url: `https://cdn.jsdelivr.net/gh/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}@${encodeURIComponent(branch)}/${encodeSegments(path)}`
    })
    candidates.push({
      kind: 'github-raw',
      url: `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${encodeSegments(path)}`
    })
    return candidates
  }

  async put(input: PutMediaObjectInput): Promise<StoredMediaObject> {
    assertMediaObjectPath(input.path, this.config.pathPrefix)
    const expectedName = `${input.sha256}.${EXTENSION_BY_MIME[input.mimeType]}`
    if (sha256(input.buffer) !== input.sha256 || !input.path.endsWith(`/${expectedName}`)) {
      throw new MediaError({
        status: 400,
        code: 'MEDIA_INVALID_INPUT',
        message: 'Media content hash or content-addressed path does not match the upload payload.'
      })
    }

    const expectedBlobSha = gitBlobSha(input.buffer)
    const existing = await this.getObject(input.path, input.requestId)
    if (existing) {
      return this.resolveExisting(input.path, existing, expectedBlobSha)
    }
    await this.assertRepositoryCapacity(input.buffer.length, input.path, input.requestId)

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      const response = await this.request(this.contentEndpoint(input.path), {
        method: 'PUT',
        headers: this.githubHeaders(true),
        body: JSON.stringify({
          message: `Store media ${input.sha256.slice(0, 12)}`,
          content: input.buffer.toString('base64'),
          branch: this.config.github.branch
        }),
        cache: 'no-store'
      }, {
        operation: 'put',
        path: input.path,
        requestId: input.requestId
      })

      if (response.status === 409 || response.status === 422) {
        const afterConflict = await this.getObject(input.path, input.requestId)
        if (afterConflict) return this.resolveExisting(input.path, afterConflict, expectedBlobSha)
        if (attempt < this.config.maxRetries) {
          await this.sleep(100 * (attempt + 1))
          continue
        }
        throw new MediaError({
          status: 409,
          code: 'MEDIA_STORAGE_CONFLICT',
          message: 'A concurrent media upload could not be reconciled.',
          retryable: true
        })
      }
      if (response.status !== 200 && response.status !== 201) {
        throw this.storageUnavailable(response.status)
      }

      const payload = await this.readSuccessJson<GithubPutResponse>(response)
      const storedSha = payload.content?.sha
      if (!storedSha || storedSha !== expectedBlobSha) {
        throw new MediaError({
          status: 502,
          code: 'MEDIA_STORAGE_CONFLICT',
          message: 'GitHub returned an unexpected object identity for the media upload.'
        })
      }

      return {
        path: input.path,
        provider: this.provider,
        created: response.status === 201,
        providerObjectId: storedSha
      }
    }

    throw new MediaError({
      status: 409,
      code: 'MEDIA_STORAGE_CONFLICT',
      message: 'A concurrent media upload could not be reconciled.',
      retryable: true
    })
  }

  async delete(input: DeleteMediaObjectInput): Promise<DeletedMediaObject> {
    assertMediaObjectPath(input.path, this.config.pathPrefix)
    const expectedSha256 = input.expectedSha256.toLowerCase()
    const fileName = input.path.slice(input.path.lastIndexOf('/') + 1)
    if (
      !/^[a-f0-9]{64}$/.test(input.expectedSha256)
      || !/^[a-f0-9]{64}\.(?:jpg|png|webp|gif)$/.test(fileName)
      || fileName.slice(0, 64) !== expectedSha256
    ) {
      throw new MediaError({
        status: 400,
        code: 'MEDIA_INVALID_INPUT',
        message: 'Media deletion requires a matching content hash and content-addressed path.'
      })
    }

    const existing = await this.getObject(input.path, input.requestId)
    if (!existing) return this.deletedResult(input.path, false)
    if (existing.type !== 'file' || !existing.sha) {
      throw new MediaError({
        status: 409,
        code: 'MEDIA_STORAGE_CONFLICT',
        message: 'The media deletion target is not a file.'
      })
    }

    const response = await this.request(this.contentEndpoint(input.path), {
      method: 'DELETE',
      headers: this.githubHeaders(true),
      body: JSON.stringify({
        message: `Delete media ${expectedSha256.slice(0, 12)}`,
        sha: existing.sha,
        branch: this.config.github.branch
      }),
      cache: 'no-store'
    }, {
      operation: 'delete',
      path: input.path,
      requestId: input.requestId
    })

    if (response.status === 200 || response.status === 204) {
      return this.deletedResult(input.path, true)
    }
    if (response.status === 404) {
      return this.deletedResult(input.path, false)
    }
    if (response.status === 409 || response.status === 422) {
      const afterConflict = await this.getObject(input.path, input.requestId)
      if (!afterConflict) return this.deletedResult(input.path, false)
      throw new MediaError({
        status: 409,
        code: 'MEDIA_STORAGE_CONFLICT',
        message: 'The media object changed while it was being deleted.',
        retryable: true
      })
    }
    throw this.storageUnavailable(response.status)
  }

  async probe(path: string, requestId: string): Promise<MediaAvailability> {
    const candidates = this.buildCandidates(path)
    const results = await Promise.all(candidates.map(async candidate => {
      const head = await this.publicRequest(candidate.url, { method: 'HEAD', cache: 'no-store' }, {
        operation: 'probe',
        path,
        requestId
      })
      let response = head
      if (head.status === 405 || head.status === 501) {
        response = await this.publicRequest(candidate.url, {
          method: 'GET',
          headers: { Range: 'bytes=0-0' },
          cache: 'no-store'
        }, {
          operation: 'probe-range',
          path,
          requestId
        })
      }
      const available = response.status >= 200 && response.status < 300
      await response.body?.cancel().catch(() => undefined)
      return { candidate, available }
    }))

    const match = results.find(result => result.available)
    if (match) {
      return {
        available: true,
        checkedAt: new Date().toISOString(),
        url: match.candidate.url,
        candidateKind: match.candidate.kind
      }
    }

    return {
      available: false,
      checkedAt: new Date().toISOString()
    }
  }

  private contentEndpoint(path: string): string {
    const { owner, repo } = this.config.github
    return `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeSegments(path)}`
  }

  private async assertRepositoryCapacity(incomingBytes: number, path: string, requestId: string): Promise<void> {
    if (!this.config.maxRepositoryBytes) return
    const { owner, repo } = this.config.github
    const response = await this.request(
      `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      { method: 'GET', headers: this.githubHeaders(false), cache: 'no-store' },
      { operation: 'capacity', path, requestId }
    )
    if (!response.ok) throw this.storageUnavailable(response.status)
    const payload = await this.readSuccessJson<GithubRepositoryResponse>(response)
    const sizeKb = payload.size
    if (!Number.isFinite(sizeKb) || sizeKb! < 0) {
      throw new MediaError({
        status: 502,
        code: 'MEDIA_STORAGE_UNAVAILABLE',
        message: 'GitHub returned an invalid repository size.',
        retryable: true
      })
    }
    const repositoryBytes = Math.ceil(sizeKb! * 1024)
    if (repositoryBytes + incomingBytes > this.config.maxRepositoryBytes) {
      throw new MediaError({
        status: 507,
        code: 'MEDIA_REPOSITORY_CAPACITY_EXCEEDED',
        message: 'The configured image repository reached its safe capacity threshold. Rotate or change the media repository before uploading.',
        retryable: false
      })
    }
  }

  private async getObject(path: string, requestId: string): Promise<GithubContentResponse | null> {
    const url = `${this.contentEndpoint(path)}?ref=${encodeURIComponent(this.config.github.branch)}`
    const response = await this.request(url, {
      method: 'GET',
      headers: this.githubHeaders(false),
      cache: 'no-store'
    }, {
      operation: 'get',
      path,
      requestId
    })

    if (response.status === 404) return null
    if (!response.ok) throw this.storageUnavailable(response.status)
    return this.readSuccessJson<GithubContentResponse>(response)
  }

  private resolveExisting(path: string, existing: GithubContentResponse, expectedBlobSha: string): StoredMediaObject {
    if (existing.type !== 'file' || existing.sha !== expectedBlobSha) {
      throw new MediaError({
        status: 409,
        code: 'MEDIA_STORAGE_CONFLICT',
        message: 'The content-addressed media path is occupied by different data.'
      })
    }
    return {
      path,
      provider: this.provider,
      created: false,
      providerObjectId: existing.sha
    }
  }

  private deletedResult(path: string, deleted: boolean): DeletedMediaObject {
    return { path, provider: this.provider, deleted }
  }

  private githubHeaders(hasBody: boolean): HeadersInit {
    return {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${this.config.github.token}`,
      'User-Agent': 'MLog-Media',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(hasBody ? { 'Content-Type': 'application/json' } : {})
    }
  }

  private async readSuccessJson<T>(response: Response): Promise<T> {
    try {
      return await response.json() as T
    } catch {
      throw new MediaError({
        status: 502,
        code: 'MEDIA_STORAGE_UNAVAILABLE',
        message: 'GitHub returned an invalid media storage response.',
        retryable: true
      })
    }
  }

  private async request(
    url: string,
    init: RequestInit,
    context: { operation: string; path: string; requestId: string }
  ): Promise<Response> {
    return this.requestWithRetry(url, init, context)
  }

  private async publicRequest(
    url: string,
    init: RequestInit,
    context: { operation: string; path: string; requestId: string }
  ): Promise<Response> {
    try {
      return await this.requestWithRetry(url, init, context, {
        maxRetries: Math.min(1, this.config.maxRetries),
        timeoutMs: Math.min(2_500, this.config.requestTimeoutMs)
      })
    } catch (error) {
      if (error instanceof MediaError && error.code === 'MEDIA_STORAGE_UNAVAILABLE') {
        return new Response(null, { status: 503 })
      }
      throw error
    }
  }

  private async requestWithRetry(
    url: string,
    init: RequestInit,
    context: { operation: string; path: string; requestId: string },
    policy: { maxRetries?: number; timeoutMs?: number } = {}
  ): Promise<Response> {
    const maxRetries = policy.maxRetries ?? this.config.maxRetries
    const timeoutMs = policy.timeoutMs ?? this.config.requestTimeoutMs
    let lastStatus = 0
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      let response: Response | null = null
      try {
        response = await this.fetchImpl(url, { ...init, signal: controller.signal })
        lastStatus = response.status
        if (!TRANSIENT_STATUSES.has(response.status) || attempt === maxRetries) {
          return response
        }
        await response.body?.cancel().catch(() => undefined)
      } catch {
        if (attempt === maxRetries) {
          throw this.storageUnavailable(lastStatus)
        }
      } finally {
        clearTimeout(timeout)
      }

      const delayMs = retryDelay(response, attempt)
      this.logger.warn('[media][github] retry', {
        requestId: normalizeRequestId(context.requestId),
        operation: context.operation,
        path: context.path,
        attempt: attempt + 1,
        status: lastStatus,
        delayMs
      })
      await this.sleep(delayMs)
    }
    throw this.storageUnavailable(lastStatus)
  }

  private storageUnavailable(upstreamStatus: number): MediaError {
    return new MediaError({
      status: upstreamStatus === 401 || upstreamStatus === 403 ? 500 : 502,
      code: 'MEDIA_STORAGE_UNAVAILABLE',
      message: 'GitHub media storage is temporarily unavailable.',
      retryable: TRANSIENT_STATUSES.has(upstreamStatus) || upstreamStatus === 0
    })
  }
}

export const githubMediaInternals = {
  gitBlobSha
}
