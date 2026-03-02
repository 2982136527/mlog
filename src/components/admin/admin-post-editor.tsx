'use client'

import type React from 'react'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AdminPostDetail, AdminPostLocaleData, AdminLocale } from '@/types/admin'
import type { PostFrontmatter } from '@/types/content'

type AdminPostEditorProps = {
  mode: 'new' | 'edit'
  initial: AdminPostDetail
}

type LocaleDraftState = {
  exists: boolean
  sha: string | null
  frontmatter: PostFrontmatter
  markdown: string
}

type LocaleStateMap = Record<AdminLocale, LocaleDraftState>

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

function defaultFrontmatter(): PostFrontmatter {
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

function ensureFrontmatter(frontmatter: PostFrontmatter): PostFrontmatter {
  const tags = frontmatter.tags.map(tag => tag.trim()).filter(Boolean)

  return {
    ...frontmatter,
    title: frontmatter.title.trim(),
    summary: frontmatter.summary.trim(),
    tags,
    category: frontmatter.category.trim(),
    cover: (frontmatter.cover || '').trim(),
    updated: (frontmatter.updated || todayDate()).trim(),
    draft: Boolean(frontmatter.draft)
  }
}

function validateLocale(frontmatter: PostFrontmatter, markdown: string, locale: AdminLocale) {
  if (!frontmatter.title.trim()) throw new Error(`${locale.toUpperCase()} 标题不能为空`)
  if (!frontmatter.summary.trim()) throw new Error(`${locale.toUpperCase()} 摘要不能为空`)
  if (!frontmatter.category.trim()) throw new Error(`${locale.toUpperCase()} 分类不能为空`)
  if (!frontmatter.tags.length) throw new Error(`${locale.toUpperCase()} 标签不能为空`)
  if (!markdown.trim()) throw new Error(`${locale.toUpperCase()} 正文不能为空`)
}

export function AdminPostEditor({ mode, initial }: AdminPostEditorProps) {
  const router = useRouter()
  const [slug, setSlug] = useState(initial.slug)
  const [activeLocale, setActiveLocale] = useState<AdminLocale>('zh')
  const [state, setState] = useState<LocaleStateMap>({
    zh: buildLocaleState(initial.locales.zh),
    en: buildLocaleState(initial.locales.en)
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const current = state[activeLocale]
  const normalizedSlug = useMemo(() => normalizeSlug(slug), [slug])

  const updateFrontmatter = (patch: Partial<PostFrontmatter>) => {
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

  const buildChange = (locale: AdminLocale, forceDraft?: boolean) => {
    const localeState = state[locale]
    const frontmatter = ensureFrontmatter({
      ...localeState.frontmatter,
      ...(forceDraft !== undefined ? { draft: forceDraft } : {})
    })

    validateLocale(frontmatter, localeState.markdown, locale)

    return {
      locale,
      frontmatter,
      markdown: localeState.markdown,
      baseSha: localeState.sha
    }
  }

  const publish = async () => {
    if (!normalizedSlug) {
      setMessage('Slug 不能为空')
      return
    }

    const changes: Array<ReturnType<typeof buildChange>> = []

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

    await submitChanges(changes)
  }

  const saveDraft = async () => {
    if (!normalizedSlug) {
      setMessage('Slug 不能为空')
      return
    }

    try {
      const draftChange = buildChange(activeLocale, true)
      await submitChanges([draftChange])
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存草稿失败')
    }
  }

  const submitChanges = async (changes: Array<ReturnType<typeof buildChange>>) => {
    setSaving(true)
    setMessage(null)

    try {
      const response = await fetch('/api/admin/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          slug: normalizedSlug,
          changes
        })
      })

      const data = (await response.json()) as {
        error?: { message?: string }
        publish?: { merged: boolean; prUrl: string }
      }

      if (!response.ok) {
        throw new Error(data.error?.message || '发布失败')
      }

      setMessage(data.publish?.merged ? '发布成功，PR 已自动合并' : `已创建 PR，待处理：${data.publish?.prUrl || ''}`)

      if (mode === 'new') {
        router.replace(`/admin/edit/${encodeURIComponent(normalizedSlug)}`)
      } else {
        window.location.assign(`/admin/edit/${encodeURIComponent(normalizedSlug)}`)
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '发布失败')
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

  const tagsValue = current.frontmatter.tags.join(', ')

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
        </div>
      </div>

      <div className='grid gap-4 rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur lg:grid-cols-2'>
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
            value={current.frontmatter.category}
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
            value={current.frontmatter.summary}
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
              {saving ? '处理中...' : `保存草稿（${activeLocale.toUpperCase()}）`}
            </button>

            <button
              type='button'
              onClick={publish}
              disabled={saving}
              className='w-full rounded-xl bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-strong)] disabled:cursor-not-allowed disabled:opacity-60'>
              {saving ? '处理中...' : '发布（自动 PR + 自动合并）'}
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
