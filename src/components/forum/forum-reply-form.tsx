'use client'

import { signIn } from 'next-auth/react'
import { useState } from 'react'
import type { Locale } from '@/i18n/config'

type ForumReplyFormProps = {
  locale: Locale
  threadNumber: number
  hasWriteScope: boolean
}

export function ForumReplyForm({ locale, threadNumber, hasWriteScope }: ForumReplyFormProps) {
  const copy =
    locale === 'zh'
      ? {
          title: '发表回复',
          placeholder: '输入你的回复（支持 Markdown）',
          submit: '发布回复',
          submitting: '发布中...',
          scopeRequired: '当前账号还没有 Discussions 写入权限，请先补授权。',
          submitError: '回复失败，请稍后重试。',
          authorize: '补授权'
        }
      : {
          title: 'Write a Reply',
          placeholder: 'Write your reply (Markdown supported)',
          submit: 'Post Reply',
          submitting: 'Posting...',
          scopeRequired: 'This account does not have Discussions write scope yet. Please re-authorize.',
          submitError: 'Failed to post reply. Please try again.',
          authorize: 'Authorize Scope'
        }

  const [body, setBody] = useState('')
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
      const response = await fetch(`/api/forum/threads/${threadNumber}/replies`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          body
        })
      })
      const payload = (await response.json().catch(() => null)) as
        | {
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

      setBody('')
      window.location.reload()
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
    <div className='rounded-2xl border border-white/60 bg-white/60 p-4 backdrop-blur'>
      <h3 className='font-title text-2xl text-[var(--color-ink)]'>{copy.title}</h3>
      <form className='mt-3 space-y-3' onSubmit={handleSubmit}>
        <textarea
          value={body}
          onChange={event => setBody(event.target.value)}
          placeholder={copy.placeholder}
          required
          minLength={2}
          maxLength={20000}
          rows={6}
          className='w-full rounded-xl border border-[var(--color-border-strong)] bg-white/70 px-3 py-2 text-[var(--color-ink)] outline-none transition focus:border-[var(--color-brand)]'
        />
        <div className='flex flex-wrap gap-2'>
          <button
            type='submit'
            disabled={submitting}
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
      {!hasWriteScope ? <p className='mt-2 text-xs text-[var(--color-ink-soft)]'>{copy.scopeRequired}</p> : null}
    </div>
  )
}
