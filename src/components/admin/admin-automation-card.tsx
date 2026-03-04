'use client'

import { useEffect, useMemo, useState } from 'react'
import type { GithubHotCandidatesPreviewResult, GithubHotDailyConfig, GithubHotDailyRunResult, InterestPreset } from '@/types/automation'

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

const INTEREST_PRESET_OPTIONS: Array<{ value: InterestPreset; label: string }> = [
  { value: 'mixed', label: '混合有趣项目（默认）' },
  { value: 'ai_fun', label: 'AI / Agent / LLM' },
  { value: 'dev_tools', label: '开发工具 / CLI' },
  { value: 'creative_coding', label: '创意编程 / WebGL' },
  { value: 'hardcore_engineering', label: '硬核工程 / 基础设施' }
]

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

type CandidatesResponse = {
  requestId: string
  preview: GithubHotCandidatesPreviewResult
  error?: { message?: string }
}

type RunState = {
  requestId: string
  result: GithubHotDailyRunResult
}

export function AdminAutomationCard() {
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [interestPreset, setInterestPreset] = useState<InterestPreset>('mixed')
  const [topicInput, setTopicInput] = useState('')
  const [excludeInput, setExcludeInput] = useState('')
  const [minStars, setMinStars] = useState(500)
  const [candidateWindow, setCandidateWindow] = useState(30)
  const [diversifyByLanguage, setDiversifyByLanguage] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [lastRun, setLastRun] = useState<RunState | null>(null)
  const [preview, setPreview] = useState<{ requestId: string; data: GithubHotCandidatesPreviewResult } | null>(null)

  const keywords = useMemo(() => splitKeywords(topicInput), [topicInput])
  const excludeKeywords = useMemo(() => splitKeywords(excludeInput), [excludeInput])

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
      setInterestPreset(data.config.interestPreset || 'mixed')
      setTopicInput((data.config.topicKeywords || []).join(', '))
      setExcludeInput((data.config.excludeKeywords || []).join(', '))
      setMinStars(Number.isFinite(data.config.minStars) ? data.config.minStars : 500)
      setCandidateWindow(Number.isFinite(data.config.candidateWindow) ? data.config.candidateWindow : 30)
      setDiversifyByLanguage(Boolean(data.config.diversifyByLanguage))
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
          interestPreset,
          topicKeywords: keywords,
          excludeKeywords,
          minStars: Number.isFinite(minStars) ? Math.max(0, Math.floor(minStars)) : 0,
          candidateWindow: Number.isFinite(candidateWindow) ? Math.min(50, Math.max(10, Math.floor(candidateWindow))) : 30,
          diversifyByLanguage
        })
      })
      const data = (await response.json()) as ConfigResponse
      if (!response.ok) {
        throw new Error(data.error?.message || '保存配置失败')
      }

      const prText = data.publish?.prUrl ? `，PR：${data.publish.prUrl}` : ''
      setMessage(data.changed ? `配置已更新（requestId: ${data.requestId}）${prText}` : `配置无变化（requestId: ${data.requestId}）`)
      setInterestPreset(data.config.interestPreset || 'mixed')
      setTopicInput((data.config.topicKeywords || []).join(', '))
      setExcludeInput((data.config.excludeKeywords || []).join(', '))
      setMinStars(Number.isFinite(data.config.minStars) ? data.config.minStars : 500)
      setCandidateWindow(Number.isFinite(data.config.candidateWindow) ? data.config.candidateWindow : 30)
      setDiversifyByLanguage(Boolean(data.config.diversifyByLanguage))
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

  const previewCandidates = async () => {
    setPreviewing(true)
    setMessage(null)
    try {
      const response = await fetch('/api/admin/automation/github-hot-daily/candidates', {
        cache: 'no-store'
      })
      const data = (await response.json()) as CandidatesResponse
      if (!response.ok) {
        throw new Error(data.error?.message || '候选预览失败')
      }

      setPreview({
        requestId: data.requestId,
        data: data.preview
      })
      const head = data.preview.candidates[0]
      setMessage(head ? `候选预览完成（requestId: ${data.requestId}），当前 Top1：${head.fullName}（${head.scoreInfo.score.toFixed(2)}）` : `候选预览完成（requestId: ${data.requestId}），暂无候选`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '候选预览失败')
    } finally {
      setPreviewing(false)
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
        预设主题
        <select
          value={interestPreset}
          onChange={event => setInterestPreset(event.target.value as InterestPreset)}
          disabled={loading || saving}
          className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)]'>
          {INTEREST_PRESET_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className='block text-xs text-[var(--color-ink-soft)]'>
        叠加关键词（逗号分隔，OR 匹配）
        <input
          value={topicInput}
          onChange={event => setTopicInput(event.target.value)}
          placeholder='ai, agent, llm'
          disabled={loading || saving}
          className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] outline-none'
        />
      </label>

      <label className='block text-xs text-[var(--color-ink-soft)]'>
        排除词（逗号分隔）
        <input
          value={excludeInput}
          onChange={event => setExcludeInput(event.target.value)}
          placeholder='crypto, betting'
          disabled={loading || saving}
          className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] outline-none'
        />
      </label>

      <div className='grid gap-3 sm:grid-cols-2'>
        <label className='text-xs text-[var(--color-ink-soft)]'>
          最小 Star
          <input
            type='number'
            min={0}
            max={10000000}
            value={minStars}
            onChange={event => setMinStars(Number(event.target.value || 0))}
            disabled={loading || saving}
            className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] outline-none'
          />
        </label>
        <label className='text-xs text-[var(--color-ink-soft)]'>
          候选窗口（Trending Top N）
          <input
            type='number'
            min={10}
            max={50}
            value={candidateWindow}
            onChange={event => setCandidateWindow(Number(event.target.value || 30))}
            disabled={loading || saving}
            className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] outline-none'
          />
        </label>
      </div>

      <label className='inline-flex items-center gap-2 text-sm text-[var(--color-ink-soft)]'>
        <input type='checkbox' checked={diversifyByLanguage} onChange={event => setDiversifyByLanguage(event.target.checked)} disabled={loading || saving} />
        启用语言多样性惩罚（避免连续同语言仓库）
      </label>

      <p className='text-xs text-[var(--color-ink-soft)]'>
        生效关键词：{keywords.length > 0 ? keywords.join(', ') : '（无）'}；排除词：{excludeKeywords.length > 0 ? excludeKeywords.join(', ') : '（无）'}
      </p>

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
          onClick={previewCandidates}
          disabled={loading || previewing}
          className='rounded-xl border border-[var(--color-border-strong)] bg-white px-4 py-2 text-sm text-[var(--color-ink)] transition hover:border-[var(--color-brand)] disabled:cursor-not-allowed disabled:opacity-60'>
          {previewing ? '预览中...' : '候选预览'}
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

      {preview && (
        <div className='rounded-xl border border-[var(--color-border-strong)] bg-white/80 px-3 py-3 text-xs text-[var(--color-ink-soft)]'>
          <p>候选预览 requestId：{preview.requestId}</p>
          <p>日期：{preview.data.dateIso}</p>
          <p>主题回退：{preview.data.usedTopicFallback ? '是' : '否'}</p>
          <p>关键词：{preview.data.keywords.length > 0 ? preview.data.keywords.join(', ') : '（无）'}</p>
          <p>排除词：{preview.data.excludeKeywords.length > 0 ? preview.data.excludeKeywords.join(', ') : '（无）'}</p>
          {preview.data.candidates.length > 0 ? (
            <div className='mt-2 space-y-2'>
              {preview.data.candidates.slice(0, 8).map(candidate => (
                <div key={candidate.fullName} className='rounded-lg border border-[var(--color-border-strong)] bg-white px-2 py-2'>
                  <p className='text-[var(--color-ink)]'>
                    #{candidate.rank} {candidate.fullName} ({candidate.language || 'unknown'}) / ⭐ {candidate.stars}
                  </p>
                  <p>评分：{candidate.scoreInfo.score.toFixed(2)}</p>
                  <p>命中关键词：{candidate.scoreInfo.matchedKeywords.length > 0 ? candidate.scoreInfo.matchedKeywords.join(', ') : '（无）'}</p>
                  <p>评分依据：{candidate.scoreInfo.reason.join(' | ')}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className='mt-2'>暂无候选（可能被排除词或历史去重影响）。</p>
          )}
        </div>
      )}
    </section>
  )
}
