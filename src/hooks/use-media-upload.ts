'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AdminMediaApiResponse,
  AdminMediaAsset,
  AdminMediaPoll,
  AdminMediaStatus
} from '@/types/media'

const DEFAULT_POLL_MS = 2_000
const MIN_POLL_MS = 750
const MAX_POLL_MS = 10_000
const POLL_TIMEOUT_MS = 60_000

type UploadPhase = 'idle' | 'uploading' | 'processing' | 'ready' | 'failed'

export type MediaUploadState = {
  phase: UploadPhase
  asset: AdminMediaAsset | null
  error: string | null
}

type UploadOptions = {
  alt: string
  slug?: string
}

type NormalizedMediaResponse = {
  asset: AdminMediaAsset
  poll: AdminMediaPoll | null
  error?: {
    code?: string
    message?: string
    retryable?: boolean
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

function numberValue(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }
  return null
}

function normalizeStatus(value: unknown, available: boolean, url: string): AdminMediaStatus {
  if (value === 'failed' || value === 'deleted' || value === 'processing' || value === 'ready') {
    return value
  }
  return available && Boolean(url) ? 'ready' : 'processing'
}

function preferredLink(links: Record<string, unknown>): string {
  const candidates = Array.isArray(links.displayCandidates) ? links.displayCandidates : []
  return stringValue(
    links.public,
    links.url,
    links.customCdn,
    links.cdn,
    links.raw,
    ...candidates
  )
}

export function normalizeMediaAsset(
  value: unknown,
  fallback: Partial<AdminMediaApiResponse> = {}
): AdminMediaAsset {
  const media = isRecord(value) ? value : {}
  const links = isRecord(media.links)
    ? media.links
    : isRecord(fallback.links)
      ? fallback.links
      : {}
  const availability = isRecord(media.availability) ? media.availability : {}
  const sha256 = stringValue(media.sha256, media.hash)
  const url = stringValue(fallback.url, media.url, preferredLink(links))
  const available = typeof fallback.available === 'boolean'
    ? fallback.available
    : typeof media.available === 'boolean'
      ? media.available
      : typeof availability.available === 'boolean'
        ? availability.available
        : Boolean(url) && fallback.status !== 'processing'
  const pathFilename = typeof media.path === 'string' ? media.path.split('/').pop() : ''
  const filename = stringValue(media.filename, media.originalName, media.name, pathFilename, 'image')
  const status = normalizeStatus(fallback.status ?? media.status, available, url)

  return {
    id: stringValue(media.id, sha256),
    status,
    filename,
    alt: stringValue(media.alt, media.title, filename.replace(/\.[^.]+$/, '')),
    mimeType: stringValue(media.mimeType, media.type),
    size: numberValue(media.size, media.bytes) ?? 0,
    width: numberValue(media.width),
    height: numberValue(media.height),
    hash: sha256,
    url: status === 'ready' && available ? url || null : null,
    markdown: status === 'ready' && available
      ? stringValue(fallback.markdown, media.markdown, links.markdown) || null
      : null,
    available: status === 'ready' && available && Boolean(url),
    duplicate: Boolean(fallback.duplicate ?? fallback.isDuplicate ?? media.duplicate ?? media.isDuplicate),
    createdAt: stringValue(media.createdAt, media.created, new Date().toISOString()),
    checkedAt: stringValue(media.checkedAt, availability.checkedAt) || null
  }
}

function normalizeResponse(payload: AdminMediaApiResponse): NormalizedMediaResponse {
  const source = payload.media ?? payload.image ?? payload
  const sourceRecord = isRecord(source) ? source : {}
  const sourceError = isRecord(sourceRecord.error) ? sourceRecord.error : undefined
  const asset = normalizeMediaAsset(source, payload)
  const pollUrl = stringValue(payload.poll?.url)
  const poll = pollUrl
    ? {
        url: pollUrl,
        afterMs: Math.min(
          MAX_POLL_MS,
          Math.max(MIN_POLL_MS, numberValue(payload.poll?.afterMs) ?? DEFAULT_POLL_MS)
        ),
        ...(stringValue(payload.poll?.expiresAt) ? { expiresAt: stringValue(payload.poll?.expiresAt) } : {})
      }
    : asset.id
      ? { url: `/api/admin/media/${encodeURIComponent(asset.id)}`, afterMs: DEFAULT_POLL_MS }
      : null

  return {
    asset,
    poll,
    error: payload.error || (sourceError
      ? {
          code: stringValue(sourceError.code) || undefined,
          message: stringValue(sourceError.message) || undefined,
          retryable: typeof sourceError.retryable === 'boolean' ? sourceError.retryable : undefined
        }
      : undefined)
  }
}

async function readResponse(response: Response): Promise<NormalizedMediaResponse> {
  const payload = await response.json().catch(() => ({})) as AdminMediaApiResponse
  const normalized = normalizeResponse(payload)

  if (!response.ok) {
    throw new Error(payload.error?.message || `媒体请求失败（${response.status}）`)
  }
  if (normalized.asset.status === 'failed' || normalized.asset.status === 'deleted') {
    throw new Error(normalized.error?.message || '图片处理失败')
  }
  return normalized
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      window.clearTimeout(timeout)
      reject(new DOMException('Upload cancelled', 'AbortError'))
    }, { once: true })
  })
}

export function useMediaUpload() {
  const [state, setState] = useState<MediaUploadState>({
    phase: 'idle',
    asset: null,
    error: null
  })
  const controllerRef = useRef<AbortController | null>(null)

  const cancel = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
  }, [])

  const reset = useCallback(() => {
    cancel()
    setState({ phase: 'idle', asset: null, error: null })
  }, [cancel])

  useEffect(() => cancel, [cancel])

  const upload = useCallback(async (file: File, options: UploadOptions): Promise<AdminMediaAsset> => {
    cancel()
    const controller = new AbortController()
    controllerRef.current = controller
    setState({ phase: 'uploading', asset: null, error: null })

    try {
      const formData = new FormData()
      formData.set('file', file)
      formData.set('alt', options.alt.trim())
      if (options.slug) {
        formData.set('slug', options.slug)
      }

      const response = await fetch('/api/admin/media', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      })
      let normalized = await readResponse(response)

      if (normalized.asset.available && normalized.asset.url) {
        setState({ phase: 'ready', asset: normalized.asset, error: null })
        return normalized.asset
      }

      setState({ phase: 'processing', asset: normalized.asset, error: null })
      const startedAt = Date.now()
      let deadlineAt = normalized.poll?.expiresAt
        ? Date.parse(normalized.poll.expiresAt)
        : startedAt + POLL_TIMEOUT_MS
      if (!Number.isFinite(deadlineAt)) deadlineAt = startedAt + POLL_TIMEOUT_MS

      while (!normalized.asset.available) {
        if (!normalized.poll?.url) {
          throw new Error('图片正在处理，但服务端未返回轮询地址')
        }
        if (Date.now() >= Math.min(deadlineAt, startedAt + POLL_TIMEOUT_MS)) {
          throw new Error('图片公开地址尚未就绪，请稍后在媒体库中重试')
        }

        await wait(normalized.poll.afterMs, controller.signal)
        const pollResponse = await fetch(normalized.poll.url, {
          cache: 'no-store',
          signal: controller.signal
        })
        normalized = await readResponse(pollResponse)
        const nextDeadline = normalized.poll?.expiresAt ? Date.parse(normalized.poll.expiresAt) : Number.NaN
        if (Number.isFinite(nextDeadline)) deadlineAt = Math.min(deadlineAt, nextDeadline)
        setState({
          phase: normalized.asset.available ? 'ready' : 'processing',
          asset: normalized.asset,
          error: null
        })
      }

      if (!normalized.asset.url) {
        throw new Error('图片已处理，但缺少公开地址')
      }
      return normalized.asset
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error
      }
      const message = error instanceof Error ? error.message : '图片上传失败'
      setState({ phase: 'failed', asset: null, error: message })
      throw error
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
      }
    }
  }, [cancel])

  return {
    state,
    upload,
    cancel,
    reset
  }
}
