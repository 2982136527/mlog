'use client'

import { useEffect, useRef } from 'react'
import Giscus from '@giscus/react'
import type { Locale } from '@/i18n/config'

const config = {
  repo: process.env.NEXT_PUBLIC_GISCUS_REPO,
  repoId: process.env.NEXT_PUBLIC_GISCUS_REPO_ID,
  category: process.env.NEXT_PUBLIC_GISCUS_CATEGORY,
  categoryId: process.env.NEXT_PUBLIC_GISCUS_CATEGORY_ID,
  mapping: process.env.NEXT_PUBLIC_GISCUS_MAPPING ?? 'pathname'
}

type GiscusCommentsProps = {
  locale: Locale
  slug: string
  title: string
}

export function GiscusComments({ locale, slug, title }: GiscusCommentsProps) {
  const enabled = Boolean(config.repo && config.repoId && config.category && config.categoryId)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const trackedRef = useRef(false)

  useEffect(() => {
    if (!enabled || trackedRef.current || !containerRef.current) {
      return
    }

    const observer = new IntersectionObserver(
      entries => {
        const entry = entries[0]
        if (!entry || !entry.isIntersecting || trackedRef.current) {
          return
        }

        trackedRef.current = true
        observer.disconnect()

        void fetch('/api/user/activity/comment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            locale,
            slug,
            title
          })
        }).catch(() => {
          // no-op
        })
      },
      {
        threshold: 0.2
      }
    )

    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [enabled, locale, slug, title])

  if (!enabled) {
    return null
  }

  return (
    <div ref={containerRef} className='mt-10 rounded-2xl border border-white/60 bg-white/55 p-5 backdrop-blur'>
      <Giscus
        id='comments'
        repo={config.repo as `${string}/${string}`}
        repoId={config.repoId!}
        category={config.category!}
        categoryId={config.categoryId!}
        mapping={config.mapping as 'pathname' | 'url' | 'title' | 'og:title' | 'specific'}
        reactionsEnabled='1'
        emitMetadata='0'
        inputPosition='top'
        theme='light'
        lang='en'
        loading='lazy'
      />
    </div>
  )
}
