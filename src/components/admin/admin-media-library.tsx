'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMediaUpload } from '@/hooks/use-media-upload'
import { normalizeMediaAsset } from '@/hooks/use-media-upload'
import type { AdminMediaAsset, AdminMediaListResponse } from '@/types/media'

type AdminMediaLibraryProps = {
  embedded?: boolean
  slug?: string
  onInsert?: (asset: AdminMediaAsset, alt: string) => void
  onSetCover?: (asset: AdminMediaAsset) => void
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function mediaAlt(asset: AdminMediaAsset): string {
  return asset.alt || asset.filename.replace(/\.[^.]+$/, '') || 'image'
}

function getListItems(payload: AdminMediaListResponse): unknown[] {
  if (Array.isArray(payload.items)) return payload.items
  if (Array.isArray(payload.media)) return payload.media
  if (Array.isArray(payload.images)) return payload.images
  return []
}

export function AdminMediaLibrary({ embedded = false, slug, onInsert, onSetCover }: AdminMediaLibraryProps) {
  const [items, setItems] = useState<AdminMediaAsset[]>([])
  const [selected, setSelected] = useState<AdminMediaAsset | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState(embedded ? 'ready' : 'all')
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [alt, setAlt] = useState('')
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const [managing, setManaging] = useState(false)
  const [referenceCount, setReferenceCount] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const listRequestRef = useRef<AbortController | null>(null)
  const detailRequestRef = useRef<AbortController | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  const { state: uploadState, upload, reset: resetUpload } = useMediaUpload()

  const selectAsset = useCallback((asset: AdminMediaAsset | null) => {
    detailRequestRef.current?.abort()
    detailRequestRef.current = null
    selectedIdRef.current = asset?.id || null
    setSelected(asset)
    setReferenceCount(null)
    setAlt(asset ? mediaAlt(asset) : '')
  }, [])

  const loadItems = useCallback(async (search = '', cursor?: string, status = 'all') => {
    listRequestRef.current?.abort()
    const controller = new AbortController()
    listRequestRef.current = controller

    if (cursor) {
      setLoadingMore(true)
    } else {
      setLoading(true)
      setNextCursor(null)
    }
    setListError(null)
    try {
      const params = new URLSearchParams({ limit: '50' })
      params.set('status', status)
      if (search.trim()) {
        params.set('q', search.trim())
        params.set('query', search.trim())
      }
      if (cursor) params.set('cursor', cursor)
      const response = await fetch(`/api/admin/media?${params.toString()}`, {
        cache: 'no-store',
        signal: controller.signal
      })
      const payload = await response.json().catch(() => ({})) as AdminMediaListResponse
      if (controller.signal.aborted || listRequestRef.current !== controller) return
      if (!response.ok) {
        throw new Error(payload.error?.message || `媒体库读取失败（${response.status}）`)
      }

      const nextItems = getListItems(payload)
        .map(item => normalizeMediaAsset(item))
        .filter(asset => asset.id && (!embedded || asset.status !== 'deleted'))
      setItems(current => cursor
        ? [...current, ...nextItems.filter(item => !current.some(existing => existing.id === item.id))]
        : nextItems)
      setNextCursor(payload.nextCursor || null)
      if (!cursor) {
        selectAsset(nextItems.find(item => item.id === selectedIdRef.current) || nextItems[0] || null)
      } else if (!selectedIdRef.current && nextItems[0]) {
        selectAsset(nextItems[0])
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      if (controller.signal.aborted || listRequestRef.current !== controller) return
      setListError(error instanceof Error ? error.message : '媒体库读取失败')
    } finally {
      if (listRequestRef.current !== controller) return
      listRequestRef.current = null
      if (cursor) {
        setLoadingMore(false)
      } else {
        setLoading(false)
      }
    }
  }, [embedded, selectAsset])

  useEffect(() => {
    void loadItems('', undefined, statusFilter)
  }, [loadItems, statusFilter])

  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview)
    }
  }, [localPreview])

  useEffect(() => {
    return () => {
      listRequestRef.current?.abort()
      detailRequestRef.current?.abort()
    }
  }, [])

  const previewUrl = selected?.url || localPreview
  const canUseSelected = Boolean(selected?.available && selected.url)
  const busy = uploadState.phase === 'uploading' || uploadState.phase === 'processing' || managing
  const statusText = useMemo(() => {
    if (uploadState.phase === 'uploading') return '正在上传图片...'
    if (uploadState.phase === 'processing') return '图片已保存，正在确认公开地址...'
    if (uploadState.phase === 'failed') return uploadState.error || '图片处理失败'
    if (uploadState.phase === 'ready') return uploadState.asset?.duplicate ? '已找到相同图片' : '图片已就绪'
    return null
  }, [uploadState])

  const handleChooseFile: React.ChangeEventHandler<HTMLInputElement> = event => {
    const nextFile = event.target.files?.[0] || null
    if (localPreview) URL.revokeObjectURL(localPreview)
    resetUpload()
    setMessage(null)
    setFile(nextFile)
    selectAsset(null)
    if (!nextFile) {
      setLocalPreview(null)
      return
    }

    setLocalPreview(URL.createObjectURL(nextFile))
    setAlt(nextFile.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim())
  }

  const handleUpload = async () => {
    if (!file) {
      fileInputRef.current?.click()
      return
    }
    if (!alt.trim()) {
      setMessage('请填写图片替代文本')
      return
    }

    setMessage(null)
    try {
      const asset = await upload(file, { alt, slug })
      if (!embedded) setStatusFilter('ready')
      selectAsset({ ...asset, alt: alt.trim() })
      setItems(current => [asset, ...current.filter(item => item.id !== asset.id)])
      setFile(null)
      if (localPreview) URL.revokeObjectURL(localPreview)
      setLocalPreview(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setMessage(error instanceof Error ? error.message : '图片上传失败')
    }
  }

  const copyUrl = async () => {
    if (!selected?.url) return
    try {
      await navigator.clipboard.writeText(selected.url)
      setMessage('图片链接已复制')
    } catch {
      setMessage('浏览器无法访问剪贴板')
    }
  }

  const chooseItem = (asset: AdminMediaAsset) => {
    if (localPreview) URL.revokeObjectURL(localPreview)
    setLocalPreview(null)
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    resetUpload()
    selectAsset(asset)
    setMessage(null)
  }

  const refreshSelected = async (includeReferences = false) => {
    if (!selected) return null
    const selectedId = selected.id
    detailRequestRef.current?.abort()
    const controller = new AbortController()
    detailRequestRef.current = controller
    const suffix = includeReferences ? '?references=1' : ''
    try {
      const response = await fetch(`/api/admin/media/${encodeURIComponent(selectedId)}${suffix}`, {
        cache: 'no-store',
        signal: controller.signal
      })
      const payload = await response.json().catch(() => ({})) as {
        media?: unknown
        references?: { count?: number }
        error?: { message?: string }
      }
      if (controller.signal.aborted || detailRequestRef.current !== controller || selectedIdRef.current !== selectedId) {
        return null
      }
      if (!response.ok && response.status !== 202) {
        throw new Error(payload.error?.message || '媒体状态刷新失败')
      }
      const refreshed = normalizeMediaAsset(payload.media)
      setSelected(current => current?.id === selectedId ? refreshed : current)
      setItems(current => current.map(item => item.id === refreshed.id ? refreshed : item))
      if (includeReferences) setReferenceCount(Number(payload.references?.count || 0))
      return { refreshed, references: payload.references }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return null
      if (controller.signal.aborted || detailRequestRef.current !== controller) return null
      throw error
    } finally {
      if (detailRequestRef.current === controller) detailRequestRef.current = null
    }
  }

  const handleSoftDelete = async () => {
    if (!selected || selected.status === 'deleted') return
    if (!window.confirm(`从媒体库移除 ${selected.filename}？公开图片仍会保留，不影响现有文章。`)) return
    const selectedId = selected.id

    setManaging(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/admin/media/${encodeURIComponent(selectedId)}`, { method: 'DELETE' })
      const payload = await response.json().catch(() => ({})) as { media?: unknown; error?: { message?: string } }
      if (!response.ok) throw new Error(payload.error?.message || '移除失败')
      const deleted = normalizeMediaAsset(payload.media)
      setItems(current => statusFilter === 'ready'
        ? current.filter(item => item.id !== selectedId)
        : current.map(item => item.id === selectedId ? deleted : item))
      if (selectedIdRef.current === selectedId) {
        selectAsset(statusFilter === 'ready' ? null : deleted)
        setMessage('已从媒体库移除，公开 URL 保持可用')
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '移除失败')
    } finally {
      setManaging(false)
    }
  }

  const handleRestore = async () => {
    if (!selected || selected.status !== 'deleted') return
    const selectedId = selected.id
    setManaging(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/admin/media/${encodeURIComponent(selectedId)}/restore`, { method: 'POST' })
      const payload = await response.json().catch(() => ({})) as { media?: unknown; error?: { message?: string } }
      if (!response.ok) throw new Error(payload.error?.message || '恢复失败')
      const restored = normalizeMediaAsset(payload.media)
      setItems(current => statusFilter === 'deleted'
        ? current.filter(item => item.id !== selectedId)
        : current.map(item => item.id === selectedId ? restored : item))
      if (selectedIdRef.current === selectedId) {
        selectAsset(statusFilter === 'deleted' ? null : restored)
        setMessage('媒体已恢复')
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '恢复失败')
    } finally {
      setManaging(false)
    }
  }

  const checkReferences = async () => {
    if (!selected) return
    setManaging(true)
    setMessage(null)
    try {
      const result = await refreshSelected(true)
      if (!result) return
      const count = Number(result?.references?.count || 0)
      setReferenceCount(count)
      setMessage(count > 0 ? `检测到 ${count} 处正文或封面引用` : '未检测到正文或封面引用')
    } catch (error) {
      setReferenceCount(null)
      setMessage(error instanceof Error ? error.message : '引用检查失败')
    } finally {
      setManaging(false)
    }
  }

  const handleRefreshStatus = async () => {
    if (!selected) return
    setManaging(true)
    setMessage(null)
    try {
      const result = await refreshSelected(false)
      if (!result) return
      setMessage(result?.refreshed.status === 'ready' ? '图片已就绪' : result?.refreshed.status === 'failed' ? '图片处理失败' : '公开地址仍在处理中')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '媒体状态刷新失败')
    } finally {
      setManaging(false)
    }
  }

  const selectedWithAlt = selected ? { ...selected, alt: alt.trim() || mediaAlt(selected) } : null

  return (
    <section className={embedded ? 'space-y-4' : 'space-y-4 rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur'}>
      <div className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]'>
        <div className='min-w-0 space-y-3'>
          <div className='flex flex-wrap items-end gap-2'>
            <form
              className='flex min-w-0 basis-full gap-2 sm:flex-1 sm:basis-auto'
              onSubmit={event => {
                event.preventDefault()
                void loadItems(query, undefined, statusFilter)
              }}>
              <label className='min-w-0 flex-1 text-xs text-[var(--color-ink-soft)]'>
                搜索媒体
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder='文件名或替代文本'
                  className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] outline-none'
                />
              </label>
              <button type='submit' disabled={loading || loadingMore} className='self-end rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] disabled:opacity-60'>
                搜索
              </button>
            </form>
            {!embedded && (
              <label className='text-xs text-[var(--color-ink-soft)]'>
                状态
                <select
                  value={statusFilter}
                  onChange={event => setStatusFilter(event.target.value)}
                  className='mt-1 block rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)]'>
                  <option value='all'>全部</option>
                  <option value='ready'>可用</option>
                  <option value='processing'>处理中</option>
                  <option value='failed'>失败</option>
                  <option value='deleted'>已移除</option>
                </select>
              </label>
            )}
            <label className='cursor-pointer rounded-xl bg-[var(--color-brand)] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-strong)]'>
              选择图片
              <input
                ref={fileInputRef}
                type='file'
                accept='image/jpeg,image/png,image/gif,image/webp'
                className='hidden'
                onChange={handleChooseFile}
                disabled={busy}
              />
            </label>
          </div>

          {listError && <p className='rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>{listError}</p>}

          <div className='grid min-h-48 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4' aria-busy={loading}>
            {loading ? (
              <p className='col-span-full px-2 py-8 text-center text-sm text-[var(--color-ink-soft)]'>正在读取媒体库...</p>
            ) : items.length === 0 ? (
              <p className='col-span-full px-2 py-8 text-center text-sm text-[var(--color-ink-soft)]'>暂无可用图片。</p>
            ) : items.map(asset => (
              <button
                key={asset.id}
                type='button'
                onClick={() => chooseItem(asset)}
                className={`min-w-0 overflow-hidden rounded-lg border bg-white text-left transition ${selected?.id === asset.id ? 'border-[var(--color-brand)] ring-2 ring-[var(--color-brand)]/20' : 'border-[var(--color-border-strong)] hover:border-[var(--color-brand)]'}`}>
                <span className='block aspect-square overflow-hidden bg-[#f7eee7]'>
                  {asset.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={asset.url} alt={mediaAlt(asset)} className='h-full w-full object-cover' loading='lazy' />
                  ) : (
                    <span className='flex h-full items-center justify-center px-2 text-center text-xs text-[var(--color-ink-soft)]'>
                      {asset.status === 'failed' ? '处理失败' : asset.status === 'deleted' ? '已移除' : '处理中'}
                    </span>
                  )}
                </span>
                <span className='block truncate px-2 pt-2 text-xs font-medium text-[var(--color-ink)]'>{asset.filename}</span>
                <span className='block px-2 pb-2 text-[11px] text-[var(--color-ink-soft)]'>{formatBytes(asset.size)}</span>
              </button>
            ))}
          </div>
          {nextCursor && (
            <div className='flex justify-center'>
              <button
                type='button'
                onClick={() => void loadItems(query, nextCursor, statusFilter)}
                disabled={loading || loadingMore}
                className='rounded-xl border border-[var(--color-border-strong)] bg-white px-4 py-2 text-sm text-[var(--color-ink)] disabled:opacity-60'>
                {loadingMore ? '正在加载...' : '加载更多'}
              </button>
            </div>
          )}
        </div>

        <aside className='min-w-0 rounded-xl border border-[var(--color-border-strong)] bg-white/80 p-3'>
          <div className='aspect-[4/3] overflow-hidden rounded-lg bg-[#f7eee7]'>
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt={alt || selected?.filename || '图片预览'} className='h-full w-full object-contain' />
            ) : (
              <div className='flex h-full items-center justify-center text-sm text-[var(--color-ink-soft)]'>选择或上传图片</div>
            )}
          </div>

          <label className='mt-3 block text-xs text-[var(--color-ink-soft)]'>
            替代文本 / Alt
            <input
              value={alt}
              onChange={event => setAlt(event.target.value)}
              maxLength={240}
              className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] outline-none'
            />
          </label>

          {selected && (
            <dl className='mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-[var(--color-ink-soft)]'>
              <dt>类型</dt><dd className='min-w-0 truncate text-right'>{selected.mimeType || '-'}</dd>
              <dt>尺寸</dt><dd className='text-right'>{selected.width && selected.height ? `${selected.width} x ${selected.height}` : '-'}</dd>
              <dt>大小</dt><dd className='text-right'>{formatBytes(selected.size)}</dd>
              <dt>状态</dt><dd className='text-right'>{selected.status}</dd>
              {referenceCount !== null && <><dt>引用</dt><dd className='text-right'>{referenceCount}</dd></>}
            </dl>
          )}

          {(statusText || message) && (
            <p className={`mt-3 rounded-xl border px-3 py-2 text-sm ${uploadState.phase === 'failed' || message?.includes('失败') ? 'border-red-200 bg-red-50 text-red-700' : 'border-[var(--color-border-strong)] bg-white text-[var(--color-ink-soft)]'}`}>
              {message || statusText}
            </p>
          )}

          <div className='mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2'>
            {file && (
              <button type='button' onClick={() => void handleUpload()} disabled={busy} className='rounded-xl bg-[var(--color-brand)] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60'>
                {busy ? '处理中...' : '开始上传'}
              </button>
            )}
            <button type='button' onClick={() => void copyUrl()} disabled={!canUseSelected} className='rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-50'>
              复制链接
            </button>
            {onInsert && (
              <button
                type='button'
                onClick={() => selectedWithAlt && onInsert(selectedWithAlt, selectedWithAlt.alt)}
                disabled={!canUseSelected || !alt.trim()}
                className='rounded-xl bg-[var(--color-brand)] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50'>
                插入正文
              </button>
            )}
            {onSetCover && (
              <button
                type='button'
                onClick={() => selectedWithAlt && onSetCover(selectedWithAlt)}
                disabled={!canUseSelected}
                className='rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-50'>
                设为封面
              </button>
            )}
            {!embedded && selected && (
              <button
                type='button'
                onClick={() => void checkReferences()}
                disabled={managing}
                className='rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-50'>
                检查引用
              </button>
            )}
            {selected?.status === 'processing' && (
              <button
                type='button'
                onClick={() => void handleRefreshStatus()}
                disabled={managing}
                className='rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-50'>
                刷新状态
              </button>
            )}
            {!embedded && selected?.status !== 'deleted' && selected && (
              <button
                type='button'
                onClick={() => void handleSoftDelete()}
                disabled={managing}
                className='rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 disabled:cursor-not-allowed disabled:opacity-50'>
                从媒体库移除
              </button>
            )}
            {!embedded && selected?.status === 'deleted' && (
              <button
                type='button'
                onClick={() => void handleRestore()}
                disabled={managing}
                className='rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-50'>
                恢复媒体
              </button>
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}
