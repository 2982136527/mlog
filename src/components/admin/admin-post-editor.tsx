'use client'

import type React from 'react'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AdminLocale, AdminPostDetail, AdminPostFrontmatterInput, AdminPostLocaleData, AdminPostPayload, AdminSubmitMode, AiExecutionStep } from '@/types/admin'

type AdminPostEditorProps = {
  mode: 'new' | 'edit'
  initial: AdminPostDetail
}

type LocaleDraftState = {
  exists: boolean
  sha: string | null
  frontmatter: AdminPostFrontmatterInput
  markdown: string
}

type LocaleStateMap = Record<AdminLocale, LocaleDraftState>

type RepoCardsDraftState = {
  enabled: boolean
  repoUrl: string
}

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

function defaultFrontmatter(): AdminPostFrontmatterInput {
  const now = todayDate()
  return {
    title: '',
    date: now,
    summary: '',
    tags: [],
    category: '',
    cover: '',
    draft: true,
    updated: now
  }
}

function buildLocaleState(source: AdminPostLocaleData): LocaleDraftState {
  return {
    exists: source.exists,
    sha: source.sha,
    frontmatter: source.frontmatter || defaultFrontmatter(),
    markdown: source.markdown || ''
  }
}

function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function ensureFrontmatter(frontmatter: AdminPostFrontmatterInput): AdminPostFrontmatterInput {
  const tags = (frontmatter.tags || []).map(tag => tag.trim()).filter(Boolean)

  return {
    ...frontmatter,
    title: frontmatter.title.trim(),
    date: frontmatter.date.trim(),
    summary: (frontmatter.summary || '').trim(),
    tags,
    category: (frontmatter.category || '').trim(),
    cover: (frontmatter.cover || '').trim(),
    updated: (frontmatter.updated || todayDate()).trim()
  }
}

function validateLocale(frontmatter: AdminPostFrontmatterInput, markdown: string, locale: AdminLocale) {
  if (!frontmatter.title.trim()) throw new Error(`${locale.toUpperCase()} 标题不能为空`)
  if (!frontmatter.date.trim()) throw new Error(`${locale.toUpperCase()} 日期不能为空`)
  if (!markdown.trim()) throw new Error(`${locale.toUpperCase()} 正文不能为空`)
}

function validateRepoCards(repoCards: RepoCardsDraftState) {
  if (!repoCards.enabled) {
    return
  }

  const value = repoCards.repoUrl.trim()
  if (!value) {
    throw new Error('已启用 GitHub 双卡时，仓库链接不能为空')
  }

  const matched = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?(?:\/)?(?:[?#].*)?$/i.test(value)
  if (!matched) {
    throw new Error('GitHub 仓库链接格式无效，示例：https://github.com/owner/repo')
  }
}

function summarizeAiSteps(steps: AiExecutionStep[]): string {
  const successes = steps.filter(step => step.status === 'success')
  if (successes.length === 0) {
    return 'AI 未执行或未生成内容。'
  }

  const translated = successes.filter(step => step.task === 'translate')
  const enriched = successes.filter(step => step.task === 'frontmatter_enrich')
  const fragments: string[] = []

  if (translated.length > 0) {
    const locales = Array.from(new Set(translated.map(step => step.locale.toUpperCase()))).join('/')
    fragments.push(`自动翻译：${locales}`)
  }
  if (enriched.length > 0) {
    const locales = Array.from(new Set(enriched.map(step => step.locale.toUpperCase()))).join('/')
    fragments.push(`补齐摘要/标签/分类：${locales}`)
  }

  return fragments.join('；')
}

export function AdminPostEditor({ mode, initial }: AdminPostEditorProps) {
  const router = useRouter()
  const [slug, setSlug] = useState(initial.slug)
  const [activeLocale, setActiveLocale] = useState<AdminLocale>('zh')
  const [state, setState] = useState<LocaleStateMap>({
    zh: buildLocaleState(initial.locales.zh),
    en: buildLocaleState(initial.locales.en)
  })
  const [repoCards, setRepoCards] = useState<RepoCardsDraftState>({
    enabled: Boolean(initial.repoCards.enabled),
    repoUrl: initial.repoCards.repoUrl || ''
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const current = state[activeLocale]
  const normalizedSlug = useMemo(() => normalizeSlug(slug), [slug])

  const updateFrontmatter = (patch: Partial<AdminPostFrontmatterInput>) => {
    setState(prev => ({
      ...prev,
      [activeLocale]: {
        ...prev[activeLocale],
        frontmatter: {
          ...prev[activeLocale].frontmatter,
          ...patch
        }
      }
    }))
  }

  const updateMarkdown = (nextMarkdown: string) => {
    setState(prev => ({
      ...prev,
      [activeLocale]: {
        ...prev[activeLocale],
        markdown: nextMarkdown
      }
    }))
  }

  const buildChange = (locale: AdminLocale, forceDraft?: boolean): AdminPostPayload => {
    const localeState = state[locale]
    const frontmatter = ensureFrontmatter({
      ...localeState.frontmatter,
      ...(forceDraft !== undefined ? { draft: forceDraft } : {})
    })

    validateLocale(frontmatter, localeState.markdown, locale)

    return {
      locale,
      frontmatter,
      markdown: localeState.markdown.trim(),
      baseSha: localeState.sha
    }
  }

  const publish = async () => {
    if (!normalizedSlug) {
      setMessage('Slug 不能为空')
      return
    }

    const changes: AdminPostPayload[] = []

    try {
      ;(['zh', 'en'] as AdminLocale[]).forEach(locale => {
        const localeState = state[locale]
        if (!localeState.markdown.trim() && !localeState.frontmatter.title.trim()) {
          return
        }
        changes.push(buildChange(locale))
      })

      if (changes.length === 0) {
        throw new Error('请至少填写一个语言版本并提供正文内容')
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '参数校验失败')
      return
    }

    await submitChanges(changes, 'publish')
  }

  const saveDraft = async () => {
    if (!normalizedSlug) {
      setMessage('Slug 不能为空')
      return
    }

    try {
      const draftChange = buildChange(activeLocale, true)
      await submitChanges([draftChange], 'draft')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存草稿失败')
    }
  }

  const submitChanges = async (changes: AdminPostPayload[], submitMode: AdminSubmitMode) => {
    setSaving(true)
    setMessage(null)

    try {
      validateRepoCards(repoCards)

      const response = await fetch('/api/admin/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          slug: normalizedSlug,
          mode: submitMode,
          changes,
          repoCards: {
            enabled: repoCards.enabled,
            repoUrl: repoCards.repoUrl.trim() || undefined
          }
        })
      })

      const data = (await response.json()) as {
        error?: { message?: string; ai?: { steps?: AiExecutionStep[] } }
        publish?: { merged: boolean; prUrl: string }
        ai?: { steps?: AiExecutionStep[] }
      }

      if (!response.ok) {
        throw new Error(data.error?.message || '发布失败')
      }

      const actionLabel = submitMode === 'draft' ? '草稿保存成功' : data.publish?.merged ? '发布成功，PR 已自动合并' : `已创建 PR，待处理：${data.publish?.prUrl || ''}`
      const aiSummary = summarizeAiSteps(data.ai?.steps || [])
      setMessage(`${actionLabel}\n${aiSummary}`)

      if (mode === 'new') {
        router.replace(`/admin/edit/${encodeURIComponent(normalizedSlug)}`)
      } else {
        window.location.assign(`/admin/edit/${encodeURIComponent(normalizedSlug)}`)
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : submitMode === 'draft' ? '保存草稿失败' : '发布失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (scope: 'current' | 'all') => {
    if (!normalizedSlug) {
      setMessage('Slug 不能为空')
      return
    }

    const confirmed = window.confirm(scope === 'all' ? `确定删除 ${normalizedSlug} 的所有语言版本？` : `确定删除 ${normalizedSlug} 的 ${activeLocale.toUpperCase()} 版本？`)
    if (!confirmed) {
      return
    }

    setSaving(true)
    setMessage(null)

    try {
      const localeParam = scope === 'all' ? 'all' : activeLocale
      const response = await fetch(`/api/admin/posts/${encodeURIComponent(normalizedSlug)}?locale=${localeParam}`, {
        method: 'DELETE'
      })

      const data = (await response.json()) as {
        error?: { message?: string }
        publish?: { merged: boolean; prUrl: string }
      }

      if (!response.ok) {
        throw new Error(data.error?.message || '删除失败')
      }

      if (scope === 'all') {
        router.replace('/admin')
        return
      }

      setState(prev => ({
        ...prev,
        [activeLocale]: {
          exists: false,
          sha: null,
          frontmatter: defaultFrontmatter(),
          markdown: ''
        }
      }))
      setMessage(data.publish?.merged ? '已删除并自动合并' : `已创建删除 PR：${data.publish?.prUrl || ''}`)
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '删除失败')
    } finally {
      setSaving(false)
    }
  }

  const handleUploadImage: React.ChangeEventHandler<HTMLInputElement> = async event => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploading(true)
    setMessage(null)

    try {
      const formData = new FormData()
      formData.set('file', file)
      if (normalizedSlug) {
        formData.set('slug', normalizedSlug)
      }

      const response = await fetch('/api/admin/media', {
        method: 'POST',
        body: formData
      })
      const data = (await response.json()) as { error?: { message?: string }; markdown?: string; publish?: { merged: boolean; prUrl: string } }

      if (!response.ok) {
        throw new Error(data.error?.message || '上传失败')
      }

      if (data.markdown) {
        updateMarkdown(`${current.markdown.trimEnd()}\n\n${data.markdown}\n`)
      }

      if (data.publish?.merged) {
        setMessage('图片上传成功并已合并，可直接插入正文')
      } else {
        setMessage(`图片已提交 PR，待处理：${data.publish?.prUrl || ''}`)
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '上传失败')
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  const tagsValue = (current.frontmatter.tags || []).join(', ')

  return (
    <div className='space-y-5'>
      <div className='rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur'>
        <div className='grid gap-3 sm:grid-cols-2'>
          <label className='text-xs text-[var(--color-ink-soft)]'>
            Slug
            <input
              value={slug}
              onChange={event => setSlug(event.target.value)}
              placeholder='example-post-slug'
              className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] outline-none'
            />
          </label>

          <div className='flex items-end gap-2'>
            <button
              type='button'
              onClick={() => setActiveLocale('zh')}
              className={`rounded-full px-3 py-1.5 text-sm ${activeLocale === 'zh' ? 'bg-[var(--color-brand)] text-white' : 'border border-[var(--color-border-strong)] bg-white text-[var(--color-ink-soft)]'}`}>
              中文
            </button>
            <button
              type='button'
              onClick={() => setActiveLocale('en')}
              className={`rounded-full px-3 py-1.5 text-sm ${activeLocale === 'en' ? 'bg-[var(--color-brand)] text-white' : 'border border-[var(--color-border-strong)] bg-white text-[var(--color-ink-soft)]'}`}>
              English
            </button>
          </div>

          <label className='inline-flex items-center gap-2 text-sm text-[var(--color-ink-soft)] sm:col-span-2'>
            <input
              type='checkbox'
              checked={repoCards.enabled}
              onChange={event => setRepoCards(prev => ({ ...prev, enabled: event.target.checked }))}
            />
            启用文章级 GitHub 双卡（发布快照 + 实时快照）
          </label>
          <label className='text-xs text-[var(--color-ink-soft)] sm:col-span-2'>
            GitHub 仓库链接（全语言共用）
            <input
              value={repoCards.repoUrl}
              onChange={event => setRepoCards(prev => ({ ...prev, repoUrl: event.target.value }))}
              placeholder='https://github.com/owner/repo'
              className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] outline-none'
            />
          </label>
        </div>
      </div>

      <div className='grid gap-4 rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur lg:grid-cols-2'>
        <p className='text-xs text-[var(--color-ink-soft)] lg:col-span-2'>提示：摘要、标签、分类可暂时留空，系统会在保存草稿/发布时通过 AI 自动补齐。</p>
        <label className='text-xs text-[var(--color-ink-soft)]'>
          标题 / Title
          <input
            value={current.frontmatter.title}
            onChange={event => updateFrontmatter({ title: event.target.value })}
            className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] outline-none'
          />
        </label>
        <label className='text-xs text-[var(--color-ink-soft)]'>
          日期 / Date
          <input
            type='date'
            value={current.frontmatter.date}
            onChange={event => updateFrontmatter({ date: event.target.value })}
            className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] outline-none'
          />
        </label>
        <label className='text-xs text-[var(--color-ink-soft)]'>
          分类 / Category
          <input
            value={current.frontmatter.category || ''}
            onChange={event => updateFrontmatter({ category: event.target.value })}
            className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] outline-none'
          />
        </label>
        <label className='text-xs text-[var(--color-ink-soft)]'>
          标签 / Tags (逗号分隔)
          <input
            value={tagsValue}
            onChange={event =>
              updateFrontmatter({
                tags: event.target.value
                  .split(',')
                  .map(tag => tag.trim())
                  .filter(Boolean)
              })
            }
            className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] outline-none'
          />
        </label>
        <label className='text-xs text-[var(--color-ink-soft)] lg:col-span-2'>
          摘要 / Summary
          <textarea
            value={current.frontmatter.summary || ''}
            onChange={event => updateFrontmatter({ summary: event.target.value })}
            rows={3}
            className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] outline-none'
          />
        </label>
        <label className='text-xs text-[var(--color-ink-soft)]'>
          封面 / Cover URL
          <input
            value={current.frontmatter.cover || ''}
            onChange={event => updateFrontmatter({ cover: event.target.value })}
            className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] outline-none'
          />
        </label>
        <label className='text-xs text-[var(--color-ink-soft)]'>
          Updated
          <input
            type='date'
            value={current.frontmatter.updated || ''}
            onChange={event => updateFrontmatter({ updated: event.target.value })}
            className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] outline-none'
          />
        </label>

        <label className='inline-flex items-center gap-2 text-sm text-[var(--color-ink-soft)]'>
          <input
            type='checkbox'
            checked={Boolean(current.frontmatter.draft)}
            onChange={event => updateFrontmatter({ draft: event.target.checked })}
          />
          草稿（draft）
        </label>
      </div>

      <div className='rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur'>
        <div className='mb-3 flex items-center justify-between'>
          <h2 className='font-title text-2xl text-[var(--color-ink)]'>Markdown ({activeLocale.toUpperCase()})</h2>
          <label className='rounded-lg border border-[var(--color-border-strong)] bg-white px-3 py-2 text-xs text-[var(--color-ink-soft)]'>
            {uploading ? '上传中...' : '上传图片'}
            <input type='file' accept='image/*' className='hidden' onChange={handleUploadImage} disabled={uploading} />
          </label>
        </div>

        <textarea
          value={current.markdown}
          onChange={event => updateMarkdown(event.target.value)}
          rows={18}
          className='w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-3 text-sm leading-6 text-[var(--color-ink)] outline-none'
          placeholder='在这里输入 Markdown 正文'
        />
      </div>

      <div className='grid gap-4 lg:grid-cols-2'>
        <div className='rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur'>
          <h2 className='font-title text-2xl text-[var(--color-ink)]'>实时预览</h2>
          <div className='prose-wrap prose mt-3 max-h-[28rem] overflow-auto rounded-xl border border-[var(--color-border-strong)] bg-white p-4'>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{current.markdown || '_（当前为空）_'}</ReactMarkdown>
          </div>
        </div>

        <div className='rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur'>
          <h2 className='font-title text-2xl text-[var(--color-ink)]'>发布操作</h2>

          <div className='mt-4 space-y-3'>
            <button
              type='button'
              onClick={saveDraft}
              disabled={saving}
              className='w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-4 py-2 text-sm text-[var(--color-ink)] transition hover:border-[var(--color-brand)] disabled:cursor-not-allowed disabled:opacity-60'>
              {saving ? '处理中...' : `保存草稿（AI 自动补齐当前语言）`}
            </button>

            <button
              type='button'
              onClick={publish}
              disabled={saving}
              className='w-full rounded-xl bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-strong)] disabled:cursor-not-allowed disabled:opacity-60'>
              {saving ? '处理中...' : '发布（AI 自动补齐 + 双语翻译 + 自动 PR）'}
            </button>

            {mode === 'edit' && (
              <>
                <button
                  type='button'
                  onClick={() => handleDelete('current')}
                  disabled={saving}
                  className='w-full rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60'>
                  删除当前语言（{activeLocale.toUpperCase()}）
                </button>

                <button
                  type='button'
                  onClick={() => handleDelete('all')}
                  disabled={saving}
                  className='w-full rounded-xl border border-red-300 bg-red-100 px-4 py-2 text-sm text-red-800 transition hover:bg-red-200 disabled:cursor-not-allowed disabled:opacity-60'>
                  删除整篇文章（全部语言）
                </button>
              </>
            )}
          </div>

          {message && <p className='mt-4 rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink-soft)]'>{message}</p>}
        </div>
      </div>
    </div>
  )
}
