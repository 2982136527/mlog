import type { AiProvider } from '@/types/admin'
import { AdminHttpError } from '@/lib/admin/errors'
import {
  getProviderDefaultBaseUrl,
  getProviderFallbackModels,
  isWritingCapableModelId,
  type DiscoverableModel
} from '@/lib/user/provider-catalog'

const MODEL_DISCOVERY_TIMEOUT_MS = 12_000

type DiscoverModelsInput = {
  provider: AiProvider
  apiKey: string
  baseUrl?: string
  includeAll?: boolean
}

export type DiscoverModelsResult = {
  provider: AiProvider
  resolvedBaseUrl: string
  source: 'live' | 'fallback'
  models: DiscoverableModel[]
  warnings?: string[]
}

type OpenAICompatibleModelsResponse = {
  data?: Array<{
    id?: string
  }>
  error?: {
    message?: string
  }
}

type GeminiModelsResponse = {
  models?: Array<{
    name?: string
    displayName?: string
    supportedGenerationMethods?: string[]
  }>
  error?: {
    message?: string
  }
}

function normalizeApiKey(input: string): string {
  const value = input.trim()
  if (!value) {
    throw new AdminHttpError(400, 'INVALID_INPUT', 'apiKey is required.')
  }
  return value
}

function normalizeBaseUrl(provider: AiProvider, input?: string): string {
  const raw = (input || '').trim()
  const candidate = raw || getProviderDefaultBaseUrl(provider)

  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    throw new AdminHttpError(400, 'INVALID_INPUT', 'baseUrl must be a valid URL.')
  }

  if (!/^https?:$/.test(parsed.protocol)) {
    throw new AdminHttpError(400, 'INVALID_INPUT', 'baseUrl must use http/https protocol.')
  }

  return candidate.replace(/\/+$/, '')
}

function dedupeAndSortModels(models: DiscoverableModel[]): DiscoverableModel[] {
  const deduped = new Map<string, DiscoverableModel>()
  for (const model of models) {
    const id = model.id.trim()
    if (!id) continue
    const key = id.toLowerCase()
    if (deduped.has(key)) continue
    deduped.set(key, {
      id,
      label: model.label?.trim() || id,
      writingCapable: Boolean(model.writingCapable)
    })
  }

  return Array.from(deduped.values()).sort((a, b) => {
    if (a.writingCapable !== b.writingCapable) {
      return a.writingCapable ? -1 : 1
    }
    return a.id.localeCompare(b.id)
  })
}

function scopeModels(models: DiscoverableModel[], includeAll: boolean): DiscoverableModel[] {
  const deduped = dedupeAndSortModels(models)
  if (includeAll) {
    return deduped
  }
  const writingOnly = deduped.filter(model => model.writingCapable)
  return writingOnly.length > 0 ? writingOnly : deduped
}

function toWarning(error: unknown): string {
  if (error instanceof AdminHttpError) {
    if (error.status === 401 || error.status === 403) {
      return '上游鉴权失败，请检查 API Key 或 Base URL。'
    }
    if (error.code === 'UPSTREAM_UNAVAILABLE') {
      return '上游模型列表暂不可用，已切换到推荐模型列表。'
    }
    return error.message
  }
  return '模型列表拉取失败，已切换到推荐模型列表。'
}

function mapUpstreamError(status: number, rawMessage: string): AdminHttpError {
  if (status === 401 || status === 403) {
    return new AdminHttpError(502, 'UPSTREAM_UNAVAILABLE', `Model upstream authentication failed (${status}).`, {
      upstreamStatus: status
    })
  }
  if (status === 404) {
    return new AdminHttpError(502, 'UPSTREAM_UNAVAILABLE', `Model upstream endpoint not found (${status}).`, {
      upstreamStatus: status
    })
  }
  return new AdminHttpError(502, 'UPSTREAM_UNAVAILABLE', rawMessage || `Model upstream request failed (${status}).`, {
    upstreamStatus: status
  })
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number }
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs || MODEL_DISCOVERY_TIMEOUT_MS)
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AdminHttpError(502, 'UPSTREAM_UNAVAILABLE', 'Model upstream request timeout.')
    }
    throw new AdminHttpError(502, 'UPSTREAM_UNAVAILABLE', error instanceof Error ? error.message : 'Model upstream request failed.')
  } finally {
    clearTimeout(timeout)
  }
}

function parseOpenAiModels(payload: OpenAICompatibleModelsResponse): DiscoverableModel[] {
  const rows = Array.isArray(payload?.data) ? payload.data : []
  return rows
    .map(item => {
      const id = typeof item?.id === 'string' ? item.id.trim() : ''
      if (!id) return null
      return {
        id,
        label: id,
        writingCapable: isWritingCapableModelId(id)
      } satisfies DiscoverableModel
    })
    .filter((item): item is DiscoverableModel => Boolean(item))
}

function parseGeminiModels(payload: GeminiModelsResponse): DiscoverableModel[] {
  const rows = Array.isArray(payload?.models) ? payload.models : []
  return rows
    .map(item => {
      const name = typeof item?.name === 'string' ? item.name.trim() : ''
      const id = name.startsWith('models/') ? name.slice('models/'.length) : name
      if (!id) return null
      const methods = Array.isArray(item?.supportedGenerationMethods)
        ? item.supportedGenerationMethods.map(method => method.toLowerCase())
        : []
      const methodSupportsWriting = methods.length === 0 || methods.includes('generatecontent') || methods.includes('generatetext')
      return {
        id,
        label: item?.displayName?.trim() || id,
        writingCapable: methodSupportsWriting && isWritingCapableModelId(id)
      } satisfies DiscoverableModel
    })
    .filter((item): item is DiscoverableModel => Boolean(item))
}

async function fetchGeminiModels(input: { apiKey: string; baseUrl: string }): Promise<DiscoverableModel[]> {
  const endpoint = `${input.baseUrl}/models?key=${encodeURIComponent(input.apiKey)}`
  const response = await fetchWithTimeout(endpoint, {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    }
  })
  const raw = await response.text()

  let parsed: GeminiModelsResponse | null = null
  try {
    parsed = raw ? (JSON.parse(raw) as GeminiModelsResponse) : null
  } catch {
    parsed = null
  }

  if (!response.ok) {
    throw mapUpstreamError(response.status, parsed?.error?.message || raw)
  }

  const models = parseGeminiModels(parsed || {})
  if (models.length === 0) {
    throw new AdminHttpError(502, 'UPSTREAM_UNAVAILABLE', 'Gemini upstream returned no models.')
  }
  return models
}

async function fetchOpenAiCompatibleModels(input: {
  apiKey: string
  baseUrl: string
}): Promise<DiscoverableModel[]> {
  const endpoint = `${input.baseUrl}/models`
  const response = await fetchWithTimeout(endpoint, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${input.apiKey}`
    }
  })
  const raw = await response.text()

  let parsed: OpenAICompatibleModelsResponse | null = null
  try {
    parsed = raw ? (JSON.parse(raw) as OpenAICompatibleModelsResponse) : null
  } catch {
    parsed = null
  }

  if (!response.ok) {
    throw mapUpstreamError(response.status, parsed?.error?.message || raw)
  }

  const models = parseOpenAiModels(parsed || {})
  if (models.length === 0) {
    throw new AdminHttpError(502, 'UPSTREAM_UNAVAILABLE', 'OpenAI-compatible upstream returned no models.')
  }
  return models
}

async function fetchLiveModels(input: {
  provider: AiProvider
  apiKey: string
  resolvedBaseUrl: string
}): Promise<DiscoverableModel[]> {
  if (input.provider === 'gemini') {
    return fetchGeminiModels({
      apiKey: input.apiKey,
      baseUrl: input.resolvedBaseUrl
    })
  }
  return fetchOpenAiCompatibleModels({
    apiKey: input.apiKey,
    baseUrl: input.resolvedBaseUrl
  })
}

export async function discoverProviderModels(input: DiscoverModelsInput): Promise<DiscoverModelsResult> {
  const includeAll = input.includeAll === true
  const apiKey = normalizeApiKey(input.apiKey)
  const resolvedBaseUrl = normalizeBaseUrl(input.provider, input.baseUrl)
  const fallbackScoped = scopeModels(getProviderFallbackModels(input.provider), includeAll)

  try {
    const liveModels = await fetchLiveModels({
      provider: input.provider,
      apiKey,
      resolvedBaseUrl
    })
    const scoped = scopeModels(liveModels, includeAll)
    if (scoped.length === 0) {
      throw new AdminHttpError(502, 'UPSTREAM_UNAVAILABLE', 'No usable models returned by upstream.')
    }
    return {
      provider: input.provider,
      resolvedBaseUrl,
      source: 'live',
      models: scoped
    }
  } catch (error) {
    if (fallbackScoped.length === 0) {
      if (error instanceof AdminHttpError) {
        throw error
      }
      throw new AdminHttpError(502, 'MODEL_DISCOVERY_FAILED', error instanceof Error ? error.message : 'Model discovery failed.')
    }
    return {
      provider: input.provider,
      resolvedBaseUrl,
      source: 'fallback',
      models: fallbackScoped,
      warnings: [toWarning(error)]
    }
  }
}
