'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Locale } from '@/i18n/config'
import { getDictionary } from '@/i18n/dictionaries'
import type { LiveCardErrorCode, LiveCardResponse, LiveCardState } from '@/types/analytics'

type PostLiveCardProps = {
  locale: Locale
  slug: string
  className?: string
}

type ApiErrorResponse = {
  error?: {
    code?: string
    message?: string
  }
}

const localeMap: Record<Locale, string> = {
  zh: 'zh-CN',
  en: 'en-US'
}

function toDateLabel(value: string | null, locale: Locale): string {
  if (!value) {
    return '—'
  }

  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) {
    return '—'
  }

  return new Intl.DateTimeFormat(localeMap[locale], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp))
}

function toNumberLabel(value: number, locale: Locale): string {
  return new Intl.NumberFormat(localeMap[locale]).format(value)
}

function resolveErrorMessage(input: {
  code: string | undefined
  message: string | undefined
  dict: ReturnType<typeof getDictionary>
}): string {
  switch (input.code) {
    case 'GITHUB_UPSTREAM_FAILED':
      return input.dict.blog.liveCardErrorUpstream
    case 'REPO_NOT_FOUND_IN_POST':
      return input.dict.blog.liveCardErrorRepoMissing
    case 'NOT_LIVE_CARD_POST':
    case 'NOT_HOT_DAILY_POST':
      return input.dict.blog.liveCardErrorNotEnabled
    default:
      return input.message || input.dict.blog.liveCardErrorUnknown
  }
}

function toErrorState(input: {
  errorCode: string | undefined
  message: string | undefined
  dict: ReturnType<typeof getDictionary>
}): LiveCardState {
  const { errorCode, message, dict } = input
  const code = (errorCode || 'UNKNOWN') as LiveCardErrorCode | 'UNKNOWN'
  return {
    status: 'error',
    code,
    message: resolveErrorMessage({
      code: errorCode,
      message,
      dict
    })
  }
}

function withCardShell(className?: string): string {
  const base = 'rounded-2xl border border-white/60 bg-white/55 p-4 shadow-[0_16px_42px_-30px_rgba(120,45,20,0.45)] backdrop-blur sm:p-5'
  return className ? `${base} ${className}` : base
}

export function PostLiveCard({ locale, slug, className }: PostLiveCardProps) {
  const dict = getDictionary(locale)
  const [state, setState] = useState<LiveCardState>({ status: 'loading' })
  const endpoint = useMemo(() => {
    const query = new URLSearchParams({
      locale,
      slug
    })
    return `/api/blog/live-card?${query.toString()}`
  }, [locale, slug])

  useEffect(() => {
    const controller = new AbortController()
    let mounted = true

    async function load() {
      setState({ status: 'loading' })

      try {
        const response = await fetch(endpoint, {
          method: 'GET',
          signal: controller.signal
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as ApiErrorResponse | null
          if (mounted) {
            setState(
              toErrorState({
                errorCode: payload?.error?.code,
                message: payload?.error?.message,
                dict
              })
            )
          }
          return
        }

        const data = (await response.json()) as LiveCardResponse
        if (mounted) {
          setState({
            status: 'ready',
            data
          })
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }

        if (mounted) {
          setState(
            toErrorState({
              errorCode: 'UNKNOWN',
              message: error instanceof Error && error.message ? error.message : undefined,
              dict
            })
          )
        }
      }
    }

    void load()

    return () => {
      mounted = false
      controller.abort()
    }
  }, [endpoint, dict])

  if (state.status === 'loading') {
    return (
      <section className={withCardShell(className)} aria-live='polite'>
        <div className='h-6 w-44 animate-pulse rounded bg-[var(--color-glass-strong)]/60' />
        <div className='mt-4 grid gap-3 sm:grid-cols-2'>
          <div className='h-20 animate-pulse rounded-xl bg-[var(--color-glass-strong)]/55' />
          <div className='h-20 animate-pulse rounded-xl bg-[var(--color-glass-strong)]/55' />
          <div className='h-20 animate-pulse rounded-xl bg-[var(--color-glass-strong)]/55' />
          <div className='h-20 animate-pulse rounded-xl bg-[var(--color-glass-strong)]/55' />
        </div>
      </section>
    )
  }

  if (state.status === 'error') {
    return (
      <section className={withCardShell(className)}>
        <h2 className='font-title text-xl text-[var(--color-ink)]'>{dict.blog.liveCardTitle}</h2>
        <p className='mt-3'>{state.message || dict.blog.liveCardUnavailable}</p>
      </section>
    )
  }

  const { data } = state

  return (
    <section className={withCardShell(className)}>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h2 className='font-title text-2xl'>{dict.blog.liveCardTitle}</h2>
        <span className='text-xs text-[var(--color-ink-soft)]'>{dict.blog.liveCardCacheHint}</span>
      </div>

      <p className='mt-2 break-all text-sm text-[var(--color-ink-soft)]'>
        <a href={data.repo.url} target='_blank' rel='noreferrer' className='transition hover:text-[var(--color-brand)]'>
          {data.repo.fullName}
        </a>
      </p>

      <div className='mt-4 grid gap-3 sm:grid-cols-2'>
        <div className='rounded-xl border border-white/60 bg-white/65 px-4 py-3'>
          <p className='text-xs text-[var(--color-ink-soft)]'>{dict.blog.liveCardStars}</p>
          <p className='mt-1 text-xl font-semibold'>{toNumberLabel(data.live.stars, locale)}</p>
        </div>
        <div className='rounded-xl border border-white/60 bg-white/65 px-4 py-3'>
          <p className='text-xs text-[var(--color-ink-soft)]'>{dict.blog.liveCardForks}</p>
          <p className='mt-1 text-xl font-semibold'>{toNumberLabel(data.live.forks, locale)}</p>
        </div>
        <div className='rounded-xl border border-white/60 bg-white/65 px-4 py-3'>
          <p className='text-xs text-[var(--color-ink-soft)]'>{dict.blog.liveCardOpenIssues}</p>
          <p className='mt-1 text-xl font-semibold'>{toNumberLabel(data.live.openIssues, locale)}</p>
        </div>
        <div className='rounded-xl border border-white/60 bg-white/65 px-4 py-3'>
          <p className='text-xs text-[var(--color-ink-soft)]'>{dict.blog.liveCardLastPush}</p>
          <p className='mt-1 text-sm font-semibold'>{toDateLabel(data.live.pushedAt, locale)}</p>
        </div>
      </div>

      <div className='mt-4 text-xs text-[var(--color-ink-soft)]'>
        <p>
          {dict.blog.liveCardUpdatedAt}: {toDateLabel(data.fetchedAt, locale)}
        </p>
        <p>
          {dict.blog.liveCardSource}: GitHub API
          {data.live.updatedAt ? ` · Repo Updated: ${toDateLabel(data.live.updatedAt, locale)}` : ''}
        </p>
      </div>
    </section>
  )
}
