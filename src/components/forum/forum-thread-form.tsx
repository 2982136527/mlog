'use client'

import { signIn } from 'next-auth/react'
import { useEffect, useMemo, useState } from 'react'
import type { Locale } from '@/i18n/config'
import { getDictionary } from '@/i18n/dictionaries'
import { withForumLocale } from '@/lib/forum/locale'
import type { ForumCategory, ForumContentLocale, ForumTranslatorProfile } from '@/types/forum'

type ForumThreadFormProps = {
  locale: Locale
  categories: ForumCategory[]
  hasWriteScope: boolean
  hasGistScope: boolean
}

export function ForumThreadForm({ locale, categories, hasWriteScope, hasGistScope }: ForumThreadFormProps) {
  const dict = getDictionary(locale)
  const copy =
    locale === 'zh'
      ? {
          title: '新建主题',
          titlePlaceholder: '请输入主题标题',
          category: '分类',
          body: '正文',
          bodyPlaceholder: '请输入主题内容（支持 Markdown）',
          sourceLocale: '源语言',
          sourceLocaleZh: '中文',
          sourceLocaleEn: '英文',
          autoTranslate: '自动补齐另一语言（Gemini）',
          geminiKey: 'Gemini Key（可选）',
          geminiKeyPlaceholder: '留空则使用已保存 Key',
          geminiModel: 'Gemini Model',
          translatorSaved: '已保存 Gemini Key，可直接留空。',
          translatorMissing: '未保存 Gemini Key，勾选自动补齐时需要填写。',
          translatorLoading: '正在读取已保存密钥状态...',
          translatorDelete: '删除已保存 Key',
          keyRequired: '你已开启自动补齐，但没有可用 Gemini Key。',
          translateFailed: 'Gemini 自动补齐失败，请检查 Key/模型后重试。',
          gistScopeRequired: '自动补齐依赖 gist 权限存储密钥，请先补授权。',
          submit: '发布主题',
          submitting: '发布中...',
          scopeRequired: '当前账号还没有 Discussions 写入权限，请补授权后再发布。',
          loginRequired: '请先登录后发布主题。',
          submitError: '发布失败，请稍后重试。',
          authorize: '补授权'
        }
      : {
          title: 'Create Thread',
          titlePlaceholder: 'Enter thread title',
          category: 'Category',
          body: 'Body',
          bodyPlaceholder: 'Write your thread content (Markdown supported)',
          sourceLocale: 'Source Language',
          sourceLocaleZh: 'Chinese',
          sourceLocaleEn: 'English',
          autoTranslate: 'Auto-complete the other language (Gemini)',
          geminiKey: 'Gemini Key (optional)',
          geminiKeyPlaceholder: 'Leave blank to use saved key',
          geminiModel: 'Gemini Model',
          translatorSaved: 'A Gemini key is already saved. You can leave it blank.',
          translatorMissing: 'No saved Gemini key. Provide one when auto-translation is enabled.',
          translatorLoading: 'Loading saved key status...',
          translatorDelete: 'Delete Saved Key',
          keyRequired: 'Auto translation is enabled but no Gemini key is available.',
          translateFailed: 'Gemini auto translation failed. Check key/model and retry.',
          gistScopeRequired: 'Auto translation requires gist scope to store your key.',
          submit: 'Publish Thread',
          submitting: 'Publishing...',
          scopeRequired: 'This account does not have Discussions write scope yet. Re-authorize before publishing.',
          loginRequired: 'Please sign in before publishing.',
          submitError: 'Failed to publish thread. Please try again.',
          authorize: 'Authorize Scope'
        }

  const defaultCategory = useMemo(() => categories[0]?.slug || '', [categories])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [categorySlug, setCategorySlug] = useState(defaultCategory)
  const [sourceLocale, setSourceLocale] = useState<ForumContentLocale>(locale === 'en' ? 'en' : 'zh')
  const [autoTranslate, setAutoTranslate] = useState(false)
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [geminiModel, setGeminiModel] = useState('gemini-2.5-pro')
  const [translatorProfile, setTranslatorProfile] = useState<ForumTranslatorProfile | null>(null)
  const [translatorLoading, setTranslatorLoading] = useState(false)
  const [translatorMessage, setTranslatorMessage] = useState<string | null>(null)
  const [deletingTranslator, setDeletingTranslator] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [needScope, setNeedScope] = useState(!hasWriteScope)

  useEffect(() => {
    let mounted = true

    async function loadTranslatorProfile() {
      if (!hasGistScope) {
        return
      }
      setTranslatorLoading(true)
      try {
        const response = await fetch('/api/forum/me/translator', {
          cache: 'no-store'
        })
        const payload = (await response.json().catch(() => null)) as
          | {
              profile?: ForumTranslatorProfile
              error?: {
                code?: string
                message?: string
              }
            }
          | null

        if (!mounted) {
          return
        }

        if (!response.ok) {
          setTranslatorMessage(payload?.error?.message || copy.gistScopeRequired)
          return
        }

        setTranslatorProfile(payload?.profile || null)
      } catch {
        if (mounted) {
          setTranslatorMessage(copy.gistScopeRequired)
        }
      } finally {
        if (mounted) {
          setTranslatorLoading(false)
        }
      }
    }

    void loadTranslatorProfile()
    return () => {
      mounted = false
    }
  }, [copy.gistScopeRequired, hasGistScope])

  async function handleDeleteSavedKey() {
    if (deletingTranslator || !hasGistScope) {
      return
    }
    setDeletingTranslator(true)
    setTranslatorMessage(null)
    try {
      const response = await fetch('/api/forum/me/translator', {
        method: 'DELETE'
      })
      const payload = (await response.json().catch(() => null)) as
        | {
            profile?: ForumTranslatorProfile
            error?: {
              message?: string
            }
          }
        | null
      if (!response.ok) {
        setTranslatorMessage(payload?.error?.message || copy.submitError)
        return
      }
      setTranslatorProfile(payload?.profile || null)
      setGeminiApiKey('')
    } catch {
      setTranslatorMessage(copy.submitError)
    } finally {
      setDeletingTranslator(false)
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) {
      return
    }
    setSubmitting(true)
    setMessage(null)

    try {
      const response = await fetch('/api/forum/threads', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          title,
          body,
          categorySlug,
          sourceLocale,
          autoTranslate,
          gemini: autoTranslate
            ? {
                apiKey: geminiApiKey.trim() || undefined,
                model: geminiModel.trim() || undefined
              }
            : undefined
        })
      })
      const payload = (await response.json().catch(() => null)) as
        | {
            thread?: {
              number: number
            }
          error?: {
            code?: string
            message?: string
          }
          mirror?: {
            number: number
          }
        }
        | null

      if (response.status === 401) {
        const callback = encodeURIComponent(window.location.pathname + window.location.search)
        window.location.href = `/me/login?locale=${locale}&callbackUrl=${callback}`
        return
      }

      if (!response.ok) {
        if (payload?.error?.code === 'FORUM_SCOPE_REQUIRED') {
          setNeedScope(true)
          setMessage(autoTranslate ? copy.gistScopeRequired : copy.scopeRequired)
        } else if (payload?.error?.code === 'FORUM_TRANSLATOR_KEY_REQUIRED') {
          setMessage(copy.keyRequired)
        } else if (payload?.error?.code === 'FORUM_TRANSLATION_FAILED') {
          setMessage(copy.translateFailed)
        } else {
          setMessage(payload?.error?.message || copy.submitError)
        }
        return
      }

      const number = payload?.thread?.number
      if (!number) {
        setMessage(copy.submitError)
        return
      }

      window.location.href = withForumLocale(`/forum/t/${number}`, locale)
    } catch {
      setMessage(copy.submitError)
    } finally {
      setSubmitting(false)
    }
  }

  function handleAuthorize() {
    const callbackUrl = window.location.href
    void signIn('github', { callbackUrl }, { scope: 'read:user user:email gist read:discussion write:discussion public_repo' })
  }

  return (
    <div className='rounded-2xl border border-white/60 bg-white/60 p-5 backdrop-blur'>
      <h2 className='font-title text-2xl text-[var(--color-ink)]'>{copy.title}</h2>
      <form className='mt-4 space-y-4' onSubmit={handleSubmit}>
        <label className='block text-sm text-[var(--color-ink-soft)]'>
          <span className='mb-1 block'>{copy.title}</span>
          <input
            type='text'
            value={title}
            onChange={event => setTitle(event.target.value)}
            placeholder={copy.titlePlaceholder}
            required
            minLength={3}
            maxLength={200}
            className='w-full rounded-xl border border-[var(--color-border-strong)] bg-white/70 px-3 py-2 text-[var(--color-ink)] outline-none transition focus:border-[var(--color-brand)]'
          />
        </label>

        <label className='block text-sm text-[var(--color-ink-soft)]'>
          <span className='mb-1 block'>{copy.category}</span>
          <select
            value={categorySlug}
            onChange={event => setCategorySlug(event.target.value)}
            className='w-full rounded-xl border border-[var(--color-border-strong)] bg-white/70 px-3 py-2 text-[var(--color-ink)] outline-none transition focus:border-[var(--color-brand)]'>
            {categories.map(item => (
              <option key={item.id} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <label className='block text-sm text-[var(--color-ink-soft)]'>
          <span className='mb-1 block'>{copy.body}</span>
          <textarea
            value={body}
            onChange={event => setBody(event.target.value)}
            placeholder={copy.bodyPlaceholder}
            required
            minLength={10}
            maxLength={20000}
            rows={10}
            className='w-full rounded-xl border border-[var(--color-border-strong)] bg-white/70 px-3 py-2 text-[var(--color-ink)] outline-none transition focus:border-[var(--color-brand)]'
          />
        </label>

        <div className='grid gap-3 sm:grid-cols-2'>
          <label className='block text-sm text-[var(--color-ink-soft)]'>
            <span className='mb-1 block'>{copy.sourceLocale}</span>
            <select
              value={sourceLocale}
              onChange={event => setSourceLocale(event.target.value === 'en' ? 'en' : 'zh')}
              className='w-full rounded-xl border border-[var(--color-border-strong)] bg-white/70 px-3 py-2 text-[var(--color-ink)] outline-none transition focus:border-[var(--color-brand)]'>
              <option value='zh'>{copy.sourceLocaleZh}</option>
              <option value='en'>{copy.sourceLocaleEn}</option>
            </select>
          </label>
          <label className='flex items-center gap-2 self-end rounded-xl border border-[var(--color-border-strong)] bg-white/70 px-3 py-2 text-sm text-[var(--color-ink)]'>
            <input type='checkbox' checked={autoTranslate} onChange={event => setAutoTranslate(event.target.checked)} />
            <span>{copy.autoTranslate}</span>
          </label>
        </div>

        {autoTranslate ? (
          <div className='space-y-3 rounded-xl border border-[var(--color-border-strong)] bg-white/70 p-3'>
            <label className='block text-sm text-[var(--color-ink-soft)]'>
              <span className='mb-1 block'>{copy.geminiKey}</span>
              <input
                type='password'
                value={geminiApiKey}
                onChange={event => setGeminiApiKey(event.target.value)}
                placeholder={copy.geminiKeyPlaceholder}
                className='w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-[var(--color-ink)] outline-none transition focus:border-[var(--color-brand)]'
              />
            </label>
            <label className='block text-sm text-[var(--color-ink-soft)]'>
              <span className='mb-1 block'>{copy.geminiModel}</span>
              <input
                type='text'
                value={geminiModel}
                onChange={event => setGeminiModel(event.target.value)}
                className='w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-[var(--color-ink)] outline-none transition focus:border-[var(--color-brand)]'
              />
            </label>
            {translatorLoading ? <p className='text-xs text-[var(--color-ink-soft)]'>{copy.translatorLoading}</p> : null}
            {!translatorLoading && translatorProfile?.hasGeminiKey ? <p className='text-xs text-[var(--color-ink-soft)]'>{copy.translatorSaved}</p> : null}
            {!translatorLoading && !translatorProfile?.hasGeminiKey ? <p className='text-xs text-[var(--color-ink-soft)]'>{copy.translatorMissing}</p> : null}
            {translatorProfile?.hasGeminiKey ? (
              <button
                type='button'
                disabled={deletingTranslator}
                onClick={handleDeleteSavedKey}
                className='inline-flex items-center rounded-full border border-[var(--color-border-strong)] bg-white px-4 py-1.5 text-xs font-medium text-[var(--color-ink)] transition hover:border-[var(--color-brand)] disabled:opacity-60'>
                {copy.translatorDelete}
              </button>
            ) : null}
            {translatorMessage ? <p className='text-xs text-[var(--color-ink-soft)]'>{translatorMessage}</p> : null}
          </div>
        ) : null}

        <div className='flex flex-wrap gap-2'>
          <button
            type='submit'
            disabled={submitting || categories.length === 0}
            className='inline-flex items-center rounded-full bg-[var(--color-brand)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-strong)] disabled:opacity-60'>
            {submitting ? copy.submitting : copy.submit}
          </button>
          {needScope && (
            <button
              type='button'
              onClick={handleAuthorize}
              className='inline-flex items-center rounded-full border border-[var(--color-border-strong)] bg-white px-5 py-2 text-sm font-semibold text-[var(--color-ink)] transition hover:border-[var(--color-brand)]'>
              {copy.authorize}
            </button>
          )}
        </div>

        {message ? (
          <p className='rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink-soft)]'>{message}</p>
        ) : null}
      </form>
      {!hasWriteScope ? <p className='mt-3 text-xs text-[var(--color-ink-soft)]'>{copy.scopeRequired}</p> : null}
      {categories.length === 0 ? <p className='mt-3 text-xs text-[var(--color-ink-soft)]'>{dict.forum.noCategories}</p> : null}
    </div>
  )
}
