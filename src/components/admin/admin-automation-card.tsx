'use client'

import { useEffect, useMemo, useState } from 'react'
import type { GithubHotDailyConfig, GithubHotDailyRunResult } from '@/types/automation'

function splitKeywords(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(',')
        .map(item => item.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 20)
    )
  )
}

function summarizeRunResult(result: GithubHotDailyRunResult): string {
  if (result.status === 'PUBLISHED') {
    const repoText = result.selectedRepo?.fullName ? `仓库：${result.selectedRepo.fullName}` : '仓库：-'
    const slugText = result.slug ? `Slug：${result.slug}` : 'Slug：-'
    const prText = result.publish?.prUrl ? `PR：${result.publish.prUrl}` : 'PR：-'
    return `已发布。${repoText}；${slugText}；${prText}`
  }

  const reason = result.reason || '-'
  return `未发布（${result.status}）：${reason}`
}

type ConfigResponse = {
  requestId: string
  config: GithubHotDailyConfig
  changed?: boolean
  publish?: { prUrl?: string; merged?: boolean }
  error?: { message?: string }
}

type RunResponse = {
  requestId: string
  result: GithubHotDailyRunResult
  error?: { message?: string }
}

type RunState = {
  requestId: string
  result: GithubHotDailyRunResult
}

export function AdminAutomationCard() {
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [topicInput, setTopicInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [lastRun, setLastRun] = useState<RunState | null>(null)

  const keywords = useMemo(() => splitKeywords(topicInput), [topicInput])

  const loadConfig = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/automation/github-hot-daily', {
        cache: 'no-store'
      })
      const data = (await response.json()) as ConfigResponse
      if (!response.ok) {
        throw new Error(data.error?.message || '读取自动发布配置失败')
      }

      setEnabled(Boolean(data.config.enabled))
      setTopicInput((data.config.topicKeywords || []).join(', '))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '读取自动发布配置失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadConfig()
  }, [])

  const saveConfig = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch('/api/admin/automation/github-hot-daily', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          enabled,
          topicKeywords: keywords
        })
      })
      const data = (await response.json()) as ConfigResponse
      if (!response.ok) {
        throw new Error(data.error?.message || '保存配置失败')
      }

      const prText = data.publish?.prUrl ? `，PR：${data.publish.prUrl}` : ''
      setMessage(data.changed ? `配置已更新（requestId: ${data.requestId}）${prText}` : `配置无变化（requestId: ${data.requestId}）`)
      setTopicInput((data.config.topicKeywords || []).join(', '))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存配置失败')
    } finally {
      setSaving(false)
    }
  }

  const runNow = async () => {
    setRunning(true)
    setMessage(null)
    setLastRun(null)
    try {
      const response = await fetch('/api/admin/automation/github-hot-daily/run', {
        method: 'POST'
      })
      const data = (await response.json()) as RunResponse
      if (!response.ok) {
        throw new Error(data.error?.message || '执行自动发布失败')
      }

      setMessage(summarizeRunResult(data.result))
      setLastRun({
        requestId: data.requestId,
        result: data.result
      })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '执行自动发布失败')
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className='space-y-4 rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur'>
      <div>
        <h3 className='font-title text-2xl text-[var(--color-ink)]'>自动发布设置（GitHub 爆火日报）</h3>
        <p className='mt-1 text-sm text-[var(--color-ink-soft)]'>数据源：Trending Daily；时区：Asia/Shanghai；计划：每日 08:00（Vercel Cron UTC 00:00）。</p>
      </div>

      <label className='inline-flex items-center gap-2 text-sm text-[var(--color-ink-soft)]'>
        <input type='checkbox' checked={enabled} onChange={event => setEnabled(event.target.checked)} disabled={loading || saving} />
        启用自动发布
      </label>

      <label className='block text-xs text-[var(--color-ink-soft)]'>
        主题关键词（逗号分隔，OR 匹配）
        <input
          value={topicInput}
          onChange={event => setTopicInput(event.target.value)}
          placeholder='ai, agent, llm'
          disabled={loading || saving}
          className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] outline-none'
        />
      </label>

      <p className='text-xs text-[var(--color-ink-soft)]'>当前关键词：{keywords.length > 0 ? keywords.join(', ') : '（空，表示不按主题过滤）'}</p>

      <div className='flex flex-wrap gap-2'>
        <button
          type='button'
          onClick={saveConfig}
          disabled={loading || saving}
          className='rounded-xl border border-[var(--color-border-strong)] bg-white px-4 py-2 text-sm text-[var(--color-ink)] transition hover:border-[var(--color-brand)] disabled:cursor-not-allowed disabled:opacity-60'>
          {saving ? '保存中...' : '保存配置'}
        </button>
        <button
          type='button'
          onClick={runNow}
          disabled={loading || running}
          className='rounded-xl bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-strong)] disabled:cursor-not-allowed disabled:opacity-60'>
          {running ? '执行中...' : '立即执行'}
        </button>
      </div>

      {message && <p className='rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink-soft)]'>{message}</p>}

      {lastRun && (
        <div className='rounded-xl border border-[var(--color-border-strong)] bg-white/80 px-3 py-3 text-xs text-[var(--color-ink-soft)]'>
          <p>requestId：{lastRun.requestId}</p>
          <p>状态：{lastRun.result.status}</p>
          <p>候选仓库：{lastRun.result.selectedRepo?.fullName || '-'}</p>
          <p>生成 slug：{lastRun.result.slug || '-'}</p>
          <p>
            PR：{lastRun.result.publish?.prUrl ? (
              <a href={lastRun.result.publish.prUrl} target='_blank' rel='noreferrer' className='text-[var(--color-brand)] underline'>
                {lastRun.result.publish.prUrl}
              </a>
            ) : (
              '-'
            )}
          </p>
          <p>主题回退：{lastRun.result.usedTopicFallback ? '是' : '否'}</p>
          <p>说明：{lastRun.result.reason || '-'}</p>
        </div>
      )}
    </section>
  )
}
