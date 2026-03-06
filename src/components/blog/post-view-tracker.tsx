'use client'

import { useEffect } from 'react'
import type { Locale } from '@/i18n/config'
import { recordLocalHistoryEvent } from '@/lib/user-history/client'

type PostViewTrackerProps = {
  locale: Locale
  slug: string
  title: string
}

export function PostViewTracker({ locale, slug, title }: PostViewTrackerProps) {
  useEffect(() => {
    recordLocalHistoryEvent({
      type: 'read',
      locale,
      slug,
      title
    })
  }, [locale, slug, title])

  return null
}
