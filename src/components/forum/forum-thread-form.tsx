'use client'

import { signIn } from 'next-auth/react'
import { useMemo, useState } from 'react'
import type { Locale } from '@/i18n/config'
import { getDictionary } from '@/i18n/dictionaries'
import { withForumLocale } from '@/lib/forum/locale'
import type { ForumCategory } from '@/types/forum'

type ForumThreadFormProps = {
  locale: Locale
  categories: ForumCategory[]
  hasWriteScope: boolean
}

export function ForumThreadForm({ locale, categories, hasWriteScope }: ForumThreadFormProps) {
  const dict = getDictionary(locale)
  const copy =
    locale === 'zh'
      ? {
          title: '新建主题',
          titlePlaceholder: '请输入主题标题',
          category: '分类',
          body: '正文',
          bodyPlaceholder: '请输入主题内容（支持 Markdown）',
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
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [needScope, setNeedScope] = useState(!hasWriteScope)

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
          categorySlug
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
          setMessage(copy.scopeRequired)
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
