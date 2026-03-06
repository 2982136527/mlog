'use client'

import { useEffect, useMemo, useState } from 'react'
import type { AiProvider } from '@/types/admin'
import { getProviderDefaultBaseUrl } from '@/lib/user/provider-catalog'
import type { UserAiProvider, UserAiProviderModelsResponse, UserAutomationJob, UserAutomationRun, UserDiscoverableModel } from '@/types/user'

type ApiError = {
  error?: {
    message?: string
  }
}

type StudioDashboardProps = {
  login: string
}

type ModelDiscoveryState = 'idle_needs_key' | 'loading' | 'success_live' | 'error_upstream'

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function providerLabel(provider: AiProvider): string {
  if (provider === 'gemini') return 'Gemini'
  if (provider === 'openai') return 'OpenAI'
  if (provider === 'deepseek') return 'DeepSeek'
  return 'Qwen'
}

export function StudioDashboard({ login }: StudioDashboardProps) {
  const [providers, setProviders] = useState<UserAiProvider[]>([])
  const [jobs, setJobs] = useState<UserAutomationJob[]>([])
  const [runs, setRuns] = useState<UserAutomationRun[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [savingProvider, setSavingProvider] = useState(false)
  const [savingJob, setSavingJob] = useState(false)

  const [providerForm, setProviderForm] = useState({
    provider: 'gemini' as AiProvider,
    model: '',
    baseUrl: getProviderDefaultBaseUrl('gemini'),
    apiKey: ''
  })
  const [includeAllModels, setIncludeAllModels] = useState(false)
  const [modelOptions, setModelOptions] = useState<UserDiscoverableModel[]>([])
  const [modelState, setModelState] = useState<ModelDiscoveryState>('idle_needs_key')
  const [modelError, setModelError] = useState<string | null>('请先填写 API Key 才能拉取完整模型列表。')
  const [discoveringModels, setDiscoveringModels] = useState(false)

  const [jobForm, setJobForm] = useState({
    providerId: '',
    topic: '',
    cronExpr: '0 9 * * *',
    timezone: 'Asia/Shanghai'
  })

  const providerOptions = useMemo(() => providers.filter(item => item.enabled), [providers])

  async function loadAll() {
    setLoading(true)
    try {
      const [providersRes, jobsRes, runsRes] = await Promise.all([
        fetch('/api/user/ai-providers', { cache: 'no-store' }),
        fetch('/api/user/automation-jobs', { cache: 'no-store' }),
        fetch('/api/user/automation-runs', { cache: 'no-store' })
      ])

      const providersData = (await providersRes.json()) as { providers?: UserAiProvider[] } & ApiError
      const jobsData = (await jobsRes.json()) as { jobs?: UserAutomationJob[] } & ApiError
      const runsData = (await runsRes.json()) as { runs?: UserAutomationRun[] } & ApiError

      if (!providersRes.ok) throw new Error(providersData.error?.message || '加载 Provider 失败')
      if (!jobsRes.ok) throw new Error(jobsData.error?.message || '加载任务失败')
      if (!runsRes.ok) throw new Error(runsData.error?.message || '加载运行记录失败')

      setProviders(providersData.providers || [])
      setJobs(jobsData.jobs || [])
      setRuns(runsData.runs || [])
      if (!jobForm.providerId && (providersData.providers || []).length > 0) {
        setJobForm(prev => ({ ...prev, providerId: providersData.providers?.[0]?.id || '' }))
      }
    } catch (error) {
      setMessage(toErrorMessage(error, '加载 Studio 数据失败'))
    } finally {
      setLoading(false)
    }
  }

  async function discoverModels(options?: { silent?: boolean }) {
    const apiKey = providerForm.apiKey.trim()
    if (!apiKey) {
      setModelOptions([])
      setModelState('idle_needs_key')
      setModelError('请先填写 API Key 才能拉取完整模型列表。')
      return
    }

    setDiscoveringModels(true)
    setModelState('loading')
    setModelError(null)
    try {
      const response = await fetch('/api/user/ai-providers/models', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider: providerForm.provider,
          apiKey,
          baseUrl: providerForm.baseUrl.trim() || undefined,
          includeAll: includeAllModels
        })
      })
      const data = (await response.json()) as UserAiProviderModelsResponse & ApiError
      if (!response.ok) {
        throw new Error(data.error?.message || '拉取模型列表失败')
      }

      const optionsList = Array.isArray(data.models) ? data.models : []
      if (optionsList.length === 0) {
        throw new Error('厂商未返回可用模型，请检查 API Key、Base URL 或稍后重试。')
      }
      setModelOptions(optionsList)
      setModelState('success_live')
      setProviderForm(prev => ({
        ...prev,
        baseUrl: data.resolvedBaseUrl,
        model: prev.model.trim() ? prev.model : optionsList[0]?.id || prev.model
      }))
    } catch (error) {
      const text = toErrorMessage(error, '拉取模型列表失败')
      setModelOptions([])
      setModelState('error_upstream')
      setModelError(text)
      if (!options?.silent) {
        setMessage(text)
      }
    } finally {
      setDiscoveringModels(false)
    }
  }

  useEffect(() => {
    void loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!providerForm.apiKey.trim()) {
      setModelOptions([])
      setModelState('idle_needs_key')
      setModelError('请先填写 API Key 才能拉取完整模型列表。')
      return
    }

    const timer = setTimeout(() => {
      void discoverModels({ silent: true })
    }, 600)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerForm.provider, providerForm.baseUrl, providerForm.apiKey, includeAllModels])

  const createProvider = async () => {
    if (!providerForm.apiKey.trim()) {
      setMessage('请填写 API Key')
      return
    }
    setSavingProvider(true)
    setMessage(null)
    try {
      const response = await fetch('/api/user/ai-providers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider: providerForm.provider,
          model: providerForm.model,
          baseUrl: providerForm.baseUrl.trim() || undefined,
          apiKey: providerForm.apiKey
        })
      })
      const data = (await response.json()) as { provider?: UserAiProvider } & ApiError
      if (!response.ok) {
        throw new Error(data.error?.message || '创建 Provider 失败')
      }
      setProviderForm(prev => ({ ...prev, apiKey: '' }))
      setMessage('Provider 已保存（密钥已加密存储）')
      await loadAll()
    } catch (error) {
      setMessage(toErrorMessage(error, '创建 Provider 失败'))
    } finally {
      setSavingProvider(false)
    }
  }

  const deleteProvider = async (id: string) => {
    if (!window.confirm('确定删除这个 Provider？')) return
    setMessage(null)
    try {
      const response = await fetch(`/api/user/ai-providers/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      })
      const data = (await response.json()) as ApiError
      if (!response.ok) {
        throw new Error(data.error?.message || '删除 Provider 失败')
      }
      setMessage('Provider 已删除')
      await loadAll()
    } catch (error) {
      setMessage(toErrorMessage(error, '删除 Provider 失败'))
    }
  }

  const createJob = async () => {
    if (!jobForm.providerId.trim()) {
      setMessage('请先选择 Provider')
      return
    }
    if (!jobForm.topic.trim()) {
      setMessage('请填写主题')
      return
    }
    setSavingJob(true)
    setMessage(null)
    try {
      const response = await fetch('/api/user/automation-jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          providerId: jobForm.providerId,
          topic: jobForm.topic,
          cronExpr: jobForm.cronExpr,
          timezone: jobForm.timezone
        })
      })
      const data = (await response.json()) as { job?: UserAutomationJob } & ApiError
      if (!response.ok) {
        throw new Error(data.error?.message || '创建任务失败')
      }
      setMessage('任务已创建')
      await loadAll()
    } catch (error) {
      setMessage(toErrorMessage(error, '创建任务失败'))
    } finally {
      setSavingJob(false)
    }
  }

  const deleteJob = async (id: string) => {
    if (!window.confirm('确定删除这个任务？')) return
    setMessage(null)
    try {
      const response = await fetch(`/api/user/automation-jobs/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      })
      const data = (await response.json()) as ApiError
      if (!response.ok) {
        throw new Error(data.error?.message || '删除任务失败')
      }
      setMessage('任务已删除')
      await loadAll()
    } catch (error) {
      setMessage(toErrorMessage(error, '删除任务失败'))
    }
  }

  const runNow = async (id: string) => {
    setMessage(null)
    try {
      const response = await fetch(`/api/user/automation-jobs/${encodeURIComponent(id)}/run`, {
        method: 'POST'
      })
      const data = (await response.json()) as { run?: UserAutomationRun } & ApiError
      if (!response.ok) {
        throw new Error(data.error?.message || '执行失败')
      }
      setMessage(`已执行：${data.run?.status || '-'}`)
      await loadAll()
    } catch (error) {
      setMessage(toErrorMessage(error, '执行失败'))
    }
  }

  return (
    <div className='space-y-5'>
      <section className='rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur'>
        <h2 className='font-title text-3xl text-[var(--color-ink)]'>User Studio</h2>
        <p className='mt-1 text-sm text-[var(--color-ink-soft)]'>
          当前用户：@{login}。你可配置自己的 AI Key 与定时任务，系统只会产出草稿，最终发布需管理员审核。
        </p>
      </section>

      <section className='space-y-3 rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur'>
        <h3 className='font-title text-2xl text-[var(--color-ink)]'>1) AI Provider（BYOK）</h3>
        <div className='grid gap-3 sm:grid-cols-2'>
          <label className='text-xs text-[var(--color-ink-soft)]'>
            Provider
            <select
              value={providerForm.provider}
              onChange={event => {
                const provider = event.target.value as AiProvider
                setProviderForm(prev => ({
                  ...prev,
                  provider,
                  baseUrl: getProviderDefaultBaseUrl(provider),
                  model: ''
                }))
                setModelOptions([])
                if (providerForm.apiKey.trim()) {
                  setModelState('loading')
                  setModelError(null)
                } else {
                  setModelState('idle_needs_key')
                  setModelError('请先填写 API Key 才能拉取完整模型列表。')
                }
              }}
              className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)]'>
              <option value='gemini'>Gemini</option>
              <option value='openai'>OpenAI Compatible</option>
              <option value='deepseek'>DeepSeek</option>
              <option value='qwen'>Qwen</option>
            </select>
          </label>
          <label className='text-xs text-[var(--color-ink-soft)]'>
            Model（可手填）
            <input
              list='studio-model-options'
              value={providerForm.model}
              onChange={event => setProviderForm(prev => ({ ...prev, model: event.target.value }))}
              className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)]'
            />
            <datalist id='studio-model-options'>
              {modelOptions.map(item => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </datalist>
          </label>
          <label className='text-xs text-[var(--color-ink-soft)]'>
            Base URL
            <input
              value={providerForm.baseUrl}
              onChange={event => setProviderForm(prev => ({ ...prev, baseUrl: event.target.value }))}
              placeholder={getProviderDefaultBaseUrl(providerForm.provider)}
              className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)]'
            />
            <button
              type='button'
              onClick={() => setProviderForm(prev => ({ ...prev, baseUrl: getProviderDefaultBaseUrl(prev.provider) }))}
              className='mt-2 text-xs font-medium text-[var(--color-brand)] transition hover:text-[var(--color-brand-strong)]'>
              恢复官方默认
            </button>
          </label>
          <label className='text-xs text-[var(--color-ink-soft)]'>
            API Key
            <input
              type='password'
              value={providerForm.apiKey}
              onChange={event => setProviderForm(prev => ({ ...prev, apiKey: event.target.value }))}
              className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)]'
            />
          </label>
        </div>
        <div className='flex flex-wrap items-center gap-3 text-xs text-[var(--color-ink-soft)]'>
          <label className='inline-flex items-center gap-2'>
            <input
              type='checkbox'
              checked={includeAllModels}
              onChange={event => setIncludeAllModels(event.target.checked)}
            />
            显示全部模型（默认仅可写作）
          </label>
          <button
            type='button'
            onClick={() => void discoverModels()}
            disabled={discoveringModels || !providerForm.apiKey.trim()}
            className='rounded-lg border border-[var(--color-border-strong)] px-2.5 py-1 text-xs text-[var(--color-ink)] transition hover:border-[var(--color-brand)] disabled:opacity-50'>
            {discoveringModels ? '拉取中...' : '刷新模型'}
          </button>
          <span>
            模型状态：
            {modelState === 'idle_needs_key'
              ? '需填写 Key'
              : modelState === 'loading'
                ? '拉取中'
                : modelState === 'success_live'
                  ? '厂商实时'
                  : '上游失败'}
          </span>
        </div>
        {modelError && (
          <div className='rounded-xl border border-red-200 bg-red-50/80 px-3 py-2 text-xs text-red-700'>{modelError}</div>
        )}
        <button
          type='button'
          onClick={createProvider}
          disabled={savingProvider}
          className='rounded-xl bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-strong)] disabled:opacity-60'>
          {savingProvider ? '保存中...' : '保存 Provider'}
        </button>

        <div className='space-y-2'>
          {providers.length === 0 && <p className='text-sm text-[var(--color-ink-soft)]'>暂无 Provider</p>}
          {providers.map(item => (
            <div key={item.id} className='flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm'>
              <div className='space-y-1'>
                <p className='font-semibold text-[var(--color-ink)]'>
                  {providerLabel(item.provider)} · {item.model}
                </p>
                <p className='text-xs text-[var(--color-ink-soft)]'>
                  密钥指纹：{item.keyFingerprint} {item.baseUrl ? `· ${item.baseUrl}` : ''}
                </p>
              </div>
              <button type='button' onClick={() => deleteProvider(item.id)} className='rounded-lg border border-red-300 px-3 py-1 text-xs text-red-700'>
                删除
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className='space-y-3 rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur'>
        <h3 className='font-title text-2xl text-[var(--color-ink)]'>2) 自动任务</h3>
        <div className='grid gap-3 sm:grid-cols-2'>
          <label className='text-xs text-[var(--color-ink-soft)]'>
            Provider
            <select
              value={jobForm.providerId}
              onChange={event => setJobForm(prev => ({ ...prev, providerId: event.target.value }))}
              className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)]'>
              <option value=''>请选择</option>
              {providerOptions.map(item => (
                <option key={item.id} value={item.id}>
                  {providerLabel(item.provider)} · {item.model}
                </option>
              ))}
            </select>
          </label>
          <label className='text-xs text-[var(--color-ink-soft)]'>
            主题
            <input
              value={jobForm.topic}
              onChange={event => setJobForm(prev => ({ ...prev, topic: event.target.value }))}
              placeholder='例如：AI Agent 工程实践'
              className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)]'
            />
          </label>
          <label className='text-xs text-[var(--color-ink-soft)]'>
            Cron（5段）
            <input
              value={jobForm.cronExpr}
              onChange={event => setJobForm(prev => ({ ...prev, cronExpr: event.target.value }))}
              placeholder='0 9 * * *'
              className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)]'
            />
          </label>
          <label className='text-xs text-[var(--color-ink-soft)]'>
            时区
            <input
              value={jobForm.timezone}
              onChange={event => setJobForm(prev => ({ ...prev, timezone: event.target.value }))}
              placeholder='Asia/Shanghai'
              className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)]'
            />
          </label>
        </div>
        <button
          type='button'
          onClick={createJob}
          disabled={savingJob}
          className='rounded-xl bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-strong)] disabled:opacity-60'>
          {savingJob ? '创建中...' : '创建任务'}
        </button>

        <div className='space-y-2'>
          {jobs.length === 0 && <p className='text-sm text-[var(--color-ink-soft)]'>暂无任务</p>}
          {jobs.map(item => (
            <div key={item.id} className='rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-3 text-sm'>
              <p className='font-semibold text-[var(--color-ink)]'>{item.topic}</p>
              <p className='mt-1 text-xs text-[var(--color-ink-soft)]'>
                cron: {item.cronExpr} · tz: {item.timezone}
              </p>
              <p className='mt-1 text-xs text-[var(--color-ink-soft)]'>
                下次执行: {item.nextRunAt || '-'} · 上次执行: {item.lastRunAt || '-'}
              </p>
              <div className='mt-2 flex gap-2'>
                <button
                  type='button'
                  onClick={() => runNow(item.id)}
                  className='rounded-lg bg-[var(--color-brand)] px-3 py-1 text-xs font-semibold text-white'>
                  立即执行
                </button>
                <button type='button' onClick={() => deleteJob(item.id)} className='rounded-lg border border-red-300 px-3 py-1 text-xs text-red-700'>
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className='space-y-3 rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur'>
        <h3 className='font-title text-2xl text-[var(--color-ink)]'>3) 最近运行记录</h3>
        {runs.length === 0 && <p className='text-sm text-[var(--color-ink-soft)]'>暂无运行记录</p>}
        {runs.map(item => (
          <div key={item.id} className='rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-xs text-[var(--color-ink-soft)]'>
            <p>
              [{item.status}] {item.provider}/{item.model}
            </p>
            <p>jobId: {item.jobId}</p>
            <p>slug: {item.slug || '-'}</p>
            <p>started: {item.startedAt}</p>
            <p>error: {item.errorCode || '-'} {item.errorMessage || ''}</p>
          </div>
        ))}
      </section>

      {loading && <p className='text-sm text-[var(--color-ink-soft)]'>加载中...</p>}
      {message && <p className='rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink-soft)]'>{message}</p>}
    </div>
  )
}
