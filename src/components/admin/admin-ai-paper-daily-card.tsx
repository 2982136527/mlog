'use client'

import { useEffect, useMemo, useState } from 'react'
import type { AiPaperDailyConfig, AiPaperDailyLastRunState, AiPaperDailyRunResult, AutomationHealth } from '@/types/automation'

function splitCategories(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
        .slice(0, 20)
    )
  )
}

function summarizeRunResult(result: AiPaperDailyRunResult): string {
  if (result.status === 'PUBLISHED') {
    const paperText = result.selectedPaper ? `论文：${result.selectedPaper.arxivId} / ${result.selectedPaper.title}` : '论文：-'
    const slugText = result.slug ? `Slug：${result.slug}` : 'Slug：-'
    const prText = result.publish?.prUrl ? `PR：${result.publish.prUrl}` : 'PR：-'
    const deployText = result.publish?.deploy?.success
      ? '部署：已触发'
      : result.publish?.deploy?.triggered
        ? `部署触发失败：${result.publish.deploy.message || 'unknown'}`
        : '部署：未触发（缺少 VERCEL_DEPLOY_HOOK_URL 或未合并）'
    const fixedTagText = result.fixedTags && result.fixedTags.length > 0 ? `固定标签：${result.fixedTags.join(', ')}` : '固定标签：-'
    const qualityText = result.quality
      ? `质量门禁：${result.quality.passed ? '通过' : '未通过'}（重试 ${result.quality.retryCount} 次）`
      : '质量门禁：-'
    return `已发布。${paperText}；${slugText}；${prText}；${fixedTagText}；${qualityText}；${deployText}`
  }

  const reason = result.reason || '-'
  return `未发布（${result.status}）：${reason}`
}

function formatHealthLabel(state: AutomationHealth['state']): string {
  if (state === 'ok') {
    return '今日状态：正常'
  }
  if (state === 'pending') {
    return '今日状态：等待主任务'
  }
  if (state === 'missed') {
    return '今日状态：漏发'
  }
  return '今日状态：已禁用'
}

function getHealthBadgeClass(state: AutomationHealth['state']): string {
  if (state === 'ok') {
    return 'border-emerald-300 bg-emerald-50 text-emerald-700'
  }
  if (state === 'pending') {
    return 'border-amber-300 bg-amber-50 text-amber-700'
  }
  if (state === 'missed') {
    return 'border-red-300 bg-red-50 text-red-700'
  }
  return 'border-slate-300 bg-slate-50 text-slate-600'
}

type ConfigResponse = {
  requestId: string
  config: AiPaperDailyConfig
  health?: AutomationHealth
  lastRun?: AiPaperDailyLastRunState | null
  changed?: boolean
  publish?: { prUrl?: string; merged?: boolean }
  error?: { message?: string }
}

type RunResponse = {
  requestId: string
  result: AiPaperDailyRunResult
  error?: { message?: string }
}

type RunState = {
  requestId: string
  result: AiPaperDailyRunResult
}

export function AdminAiPaperDailyCard() {
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [categoriesInput, setCategoriesInput] = useState('')
  const [maxCandidates, setMaxCandidates] = useState(30)
  const [minSignalsScore, setMinSignalsScore] = useState(0)
  const [includeCodeFirst, setIncludeCodeFirst] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [lastRun, setLastRun] = useState<RunState | null>(null)
  const [health, setHealth] = useState<AutomationHealth | null>(null)

  const categories = useMemo(() => splitCategories(categoriesInput), [categoriesInput])

  const loadConfig = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/automation/ai-paper-daily', {
        cache: 'no-store'
      })
      const data = (await response.json()) as ConfigResponse
      if (!response.ok) {
        throw new Error(data.error?.message || '读取论文速读配置失败')
      }

      setEnabled(Boolean(data.config.enabled))
      setCategoriesInput((data.config.arxivCategories || []).join(', '))
      setMaxCandidates(Number.isFinite(data.config.maxCandidates) ? data.config.maxCandidates : 30)
      setMinSignalsScore(Number.isFinite(data.config.minSignalsScore) ? data.config.minSignalsScore : 0)
      setIncludeCodeFirst(Boolean(data.config.includeCodeFirst))
      setLastRun(data.lastRun ? { requestId: data.lastRun.requestId, result: data.lastRun.result } : null)
      setHealth(data.health || null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '读取论文速读配置失败')
      setHealth(null)
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
      const response = await fetch('/api/admin/automation/ai-paper-daily', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          enabled,
          arxivCategories: categories,
          maxCandidates: Number.isFinite(maxCandidates) ? Math.min(50, Math.max(5, Math.floor(maxCandidates))) : 30,
          minSignalsScore: Number.isFinite(minSignalsScore) ? Math.min(100, Math.max(0, minSignalsScore)) : 0,
          includeCodeFirst
        })
      })
      const data = (await response.json()) as ConfigResponse
      if (!response.ok) {
        throw new Error(data.error?.message || '保存论文速读配置失败')
      }

      const prText = data.publish?.prUrl ? `，PR：${data.publish.prUrl}` : ''
      setMessage(data.changed ? `配置已更新（requestId: ${data.requestId}）${prText}` : `配置无变化（requestId: ${data.requestId}）`)
      setEnabled(Boolean(data.config.enabled))
      setCategoriesInput((data.config.arxivCategories || []).join(', '))
      setMaxCandidates(Number.isFinite(data.config.maxCandidates) ? data.config.maxCandidates : 30)
      setMinSignalsScore(Number.isFinite(data.config.minSignalsScore) ? data.config.minSignalsScore : 0)
      setIncludeCodeFirst(Boolean(data.config.includeCodeFirst))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存论文速读配置失败')
    } finally {
      setSaving(false)
    }
  }

  const runNow = async () => {
    setRunning(true)
    setMessage(null)
    setLastRun(null)
    try {
      const response = await fetch('/api/admin/automation/ai-paper-daily/run', {
        method: 'POST'
      })
      const data = (await response.json()) as RunResponse
      if (!response.ok) {
        throw new Error(data.error?.message || '执行论文速读自动发布失败')
      }

      setMessage(summarizeRunResult(data.result))
      setLastRun({
        requestId: data.requestId,
        result: data.result
      })
      await loadConfig()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '执行论文速读自动发布失败')
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className='space-y-4 rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur'>
      <div>
        <h3 className='font-title text-2xl text-[var(--color-ink)]'>自动发布设置（AI 论文速读）</h3>
        <p className='mt-1 text-sm text-[var(--color-ink-soft)]'>数据源：arXiv + Papers with Code；时区：Asia/Shanghai；计划：每日 12:30 主任务 + 14:30 自动补发（Vercel Cron UTC 04:30 / 06:30）。</p>
      </div>

      {health && (
        <div className='space-y-2'>
          <p className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${getHealthBadgeClass(health.state)}`}>{formatHealthLabel(health.state)}</p>
          <p className='text-xs text-[var(--color-ink-soft)]'>
            日期：{health.dateStamp}；主任务：{health.expectedRunAtLocal}；补发：{health.backfillAtLocal}；今日已发布：{health.hasPublishedToday ? '是' : '否'}
          </p>
          {health.state === 'missed' && (
            <p className='rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700'>检测到今日漏发，建议立即点击“补发今天（手动）”。</p>
          )}
        </div>
      )}

      <label className='inline-flex items-center gap-2 text-sm text-[var(--color-ink-soft)]'>
        <input type='checkbox' checked={enabled} onChange={event => setEnabled(event.target.checked)} disabled={loading || saving} />
        启用自动发布
      </label>

      <label className='block text-xs text-[var(--color-ink-soft)]'>
        arXiv 分类（逗号分隔）
        <input
          value={categoriesInput}
          onChange={event => setCategoriesInput(event.target.value)}
          placeholder='cs.AI, cs.LG, cs.CL, stat.ML'
          disabled={loading || saving}
          className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] outline-none'
        />
      </label>

      <div className='grid gap-3 sm:grid-cols-2'>
        <label className='text-xs text-[var(--color-ink-soft)]'>
          候选窗口（Top N）
          <input
            type='number'
            min={5}
            max={50}
            value={maxCandidates}
            onChange={event => setMaxCandidates(Number(event.target.value || 30))}
            disabled={loading || saving}
            className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] outline-none'
          />
        </label>
        <label className='text-xs text-[var(--color-ink-soft)]'>
          最低信号分
          <input
            type='number'
            min={0}
            max={100}
            step='0.1'
            value={minSignalsScore}
            onChange={event => setMinSignalsScore(Number(event.target.value || 0))}
            disabled={loading || saving}
            className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] outline-none'
          />
        </label>
      </div>

      <label className='inline-flex items-center gap-2 text-sm text-[var(--color-ink-soft)]'>
        <input type='checkbox' checked={includeCodeFirst} onChange={event => setIncludeCodeFirst(event.target.checked)} disabled={loading || saving} />
        优先可复现论文（有代码链接）
      </label>

      <div className='space-y-1 text-xs text-[var(--color-ink-soft)]'>
        <p>当前分类：{categories.length > 0 ? categories.join(', ') : '（无）'}</p>
        <p>固定标签：ai-paper, paper-daily</p>
      </div>

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
          disabled={loading || running || health?.state !== 'missed'}
          className='rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60'>
          {running ? '执行中...' : '补发今天（手动）'}
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
          <p>触发来源：{lastRun.result.triggerSource || '-'}</p>
          <p>候选论文：{lastRun.result.selectedPaper ? `${lastRun.result.selectedPaper.arxivId} / ${lastRun.result.selectedPaper.title}` : '-'}</p>
          <p>生成 slug：{lastRun.result.slug || '-'}</p>
          <p>固定标签：{lastRun.result.fixedTags && lastRun.result.fixedTags.length > 0 ? lastRun.result.fixedTags.join(', ') : '（无）'}</p>
          <p>
            质量门禁：{lastRun.result.quality ? `${lastRun.result.quality.passed ? '通过' : '未通过'}（重试 ${lastRun.result.quality.retryCount} 次）` : '-'}
          </p>
          <p>质量失败项：{lastRun.result.quality?.failedChecks && lastRun.result.quality.failedChecks.length > 0 ? lastRun.result.quality.failedChecks.join(' | ') : '（无）'}</p>
          <p>证据来源数：{lastRun.result.evidence?.sourceCount ?? '-'}</p>
          <p>
            PR：{lastRun.result.publish?.prUrl ? (
              <a href={lastRun.result.publish.prUrl} target='_blank' rel='noreferrer' className='text-[var(--color-brand)] underline'>
                {lastRun.result.publish.prUrl}
              </a>
            ) : (
              '-'
            )}
          </p>
          <p>
            自动部署：{lastRun.result.publish?.deploy?.success
              ? '已触发'
              : lastRun.result.publish?.deploy?.triggered
                ? `触发失败（${lastRun.result.publish.deploy.message || 'unknown'}）`
                : '未触发'}
          </p>
          <p>说明：{lastRun.result.reason || '-'}</p>
        </div>
      )}
    </section>
  )
}
