'use client'

import { useEffect } from 'react'
import type { Locale } from '@/i18n/config'

type PostViewTrackerProps = {
  locale: Locale
  slug: string
  title: string
}

export function PostViewTracker({ locale, slug, title }: PostViewTrackerProps) {
  useEffect(() => {
    const controller = new AbortController()

    void fetch('/api/user/activity/view', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        locale,
        slug,
        title
      }),
      signal: controller.signal
    }).catch(() => {
      // no-op
    })

    return () => {
      controller.abort()
    }
  }, [locale, slug, title])

  return null
}
