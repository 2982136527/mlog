'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DailyBlogConfig, DailyBlogLastRunState, DailyBlogRunResult } from '@/types/automation'

type ConfigResponse = {
  requestId: string
  config: DailyBlogConfig
  lastRun?: DailyBlogLastRunState | null
  ai?: { available: boolean; reason: string | null }
  publish?: { merged: boolean; prUrl: string; mergeMessage?: string }
  error?: { message?: string }
}

type RunResponse = {
  requestId: string
  result: DailyBlogRunResult
  error?: { message?: string }
}

function parseTopics(value: string): string[] {
  return Array.from(new Set(value.split(/[\n,，]+/).map(item => item.trim()).filter(Boolean))).slice(0, 50)
}

function summarizeRun(result: DailyBlogRunResult): string {
  if (result.status === 'PUBLISHED') {
    return `已发布：${result.slug || '-'}${result.publish?.prUrl ? `；PR：${result.publish.prUrl}` : ''}`
  }
  if (result.status === 'PENDING_REVIEW') {
    return `待审核：${result.publish?.prUrl || result.slug || '-'} `
  }
  return `未发布（${result.status}）：${result.reason || '-'}`
}

export function AdminDailyBlogCard() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [categoriesInput, setCategoriesInput] = useState('')
  const [customInput, setCustomInput] = useState('')
  const [excludeInput, setExcludeInput] = useState('')
  const [minLength, setMinLength] = useState(1200)
  const [maxLength, setMaxLength] = useState(2500)
  const [lastRun, setLastRun] = useState<DailyBlogLastRunState | null>(null)
  const [aiAvailable, setAiAvailable] = useState(true)
  const [message, setMessage] = useState<string | null>(null)

  const categories = useMemo(() => parseTopics(categoriesInput), [categoriesInput])
  const customTopics = useMemo(() => parseTopics(customInput), [customInput])
  const excludeTopics = useMemo(() => parseTopics(excludeInput), [excludeInput])

  const applyConfig = useCallback((config: DailyBlogConfig) => {
    setEnabled(config.enabled)
    setCategoriesInput(config.topicCategories.join(', '))
    setCustomInput(config.customTopics.join('\n'))
    setExcludeInput(config.excludeTopics.join('\n'))
    setMinLength(config.minLength)
    setMaxLength(config.maxLength)
  }, [])

  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/automation/daily-blog', { cache: 'no-store' })
      const data = (await response.json()) as ConfigResponse
      if (!response.ok) throw new Error(data.error?.message || '读取每日主题配置失败')
      applyConfig(data.config)
      setLastRun(data.lastRun || null)
      setAiAvailable(data.ai?.available !== false)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '读取每日主题配置失败')
    } finally {
      setLoading(false)
    }
  }, [applyConfig])

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  const saveConfig = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch('/api/admin/automation/daily-blog', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, topicCategories: categories, customTopics, excludeTopics, minLength, maxLength })
      })
      const data = (await response.json()) as ConfigResponse
      if (!response.ok) throw new Error(data.error?.message || '保存每日主题配置失败')
      applyConfig(data.config)
      setMessage(data.publish?.merged ? '配置已保存并合并' : `配置 PR 待审核：${data.publish?.prUrl || '-'}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存每日主题配置失败')
    } finally {
      setSaving(false)
    }
  }

  const runNow = async () => {
    setRunning(true)
    setMessage(null)
    try {
      const response = await fetch('/api/admin/automation/daily-blog/run', { method: 'POST' })
      const data = (await response.json()) as RunResponse
      if (!response.ok) throw new Error(data.error?.message || '执行每日主题任务失败')
      setMessage(summarizeRun(data.result))
      setLastRun({ requestId: data.requestId, actor: 'admin', runAt: new Date().toISOString(), result: data.result })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '执行每日主题任务失败')
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className='space-y-4 rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h3 className='font-title text-2xl text-[var(--color-ink)]'>每日主题文章</h3>
          <p className='mt-1 text-sm text-[var(--color-ink-soft)]'>Asia/Shanghai 09:00</p>
        </div>
        <label className='inline-flex items-center gap-2 text-sm text-[var(--color-ink-soft)]'>
          <input type='checkbox' checked={enabled} onChange={event => setEnabled(event.target.checked)} disabled={loading || saving} />
          启用
        </label>
      </div>

      {!aiAvailable && <p className='rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700'>AI 提供方当前不可用。</p>}

      <div className='grid gap-3 lg:grid-cols-3'>
        <label className='text-xs text-[var(--color-ink-soft)]'>
          主题分类
          <textarea value={categoriesInput} onChange={event => setCategoriesInput(event.target.value)} rows={4} disabled={loading || saving} className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] outline-none' />
        </label>
        <label className='text-xs text-[var(--color-ink-soft)]'>
          自定义主题
          <textarea value={customInput} onChange={event => setCustomInput(event.target.value)} rows={4} disabled={loading || saving} className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] outline-none' />
        </label>
        <label className='text-xs text-[var(--color-ink-soft)]'>
          排除主题
          <textarea value={excludeInput} onChange={event => setExcludeInput(event.target.value)} rows={4} disabled={loading || saving} className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] outline-none' />
        </label>
      </div>

      <div className='grid gap-3 sm:grid-cols-2'>
        <label className='text-xs text-[var(--color-ink-soft)]'>
          最少中文字数
          <input type='number' min={500} max={5000} value={minLength} onChange={event => setMinLength(Number(event.target.value))} disabled={loading || saving} className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] outline-none' />
        </label>
        <label className='text-xs text-[var(--color-ink-soft)]'>
          最多中文字数
          <input type='number' min={1000} max={8000} value={maxLength} onChange={event => setMaxLength(Number(event.target.value))} disabled={loading || saving} className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] outline-none' />
        </label>
      </div>

      <div className='flex flex-wrap gap-2'>
        <button type='button' onClick={saveConfig} disabled={loading || saving} className='rounded-xl border border-[var(--color-border-strong)] bg-white px-4 py-2 text-sm text-[var(--color-ink)] transition hover:border-[var(--color-brand)] disabled:opacity-60'>
          {saving ? '保存中...' : '保存配置'}
        </button>
        <button type='button' onClick={runNow} disabled={loading || running || !aiAvailable} className='rounded-xl bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-strong)] disabled:opacity-60'>
          {running ? '执行中...' : '立即执行'}
        </button>
      </div>

      {message && <p className='rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink-soft)]'>{message}</p>}
      {lastRun && (
        <div className='space-y-1 text-xs text-[var(--color-ink-soft)]'>
          <p>最近状态：{lastRun.result.status}</p>
          <p>Slug：{lastRun.result.slug || '-'}</p>
          <p>主题：{lastRun.result.selectedTopic || '-'}</p>
          <p>说明：{lastRun.result.reason || '-'}</p>
        </div>
      )}
    </section>
  )
}
