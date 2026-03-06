'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { Locale } from '@/i18n/config'
import { getDictionary } from '@/i18n/dictionaries'

type AccountEntryLinkProps = {
  locale: Locale
  className?: string
}

type SessionResponse = {
  user?: {
    login?: string
  }
}

export function AccountEntryLink({ locale, className }: AccountEntryLinkProps) {
  const dict = getDictionary(locale)
  const [isAuthed, setIsAuthed] = useState(false)

  useEffect(() => {
    let mounted = true

    async function loadSession() {
      try {
        const response = await fetch('/api/auth/session', {
          cache: 'no-store'
        })
        if (!response.ok) {
          return
        }
        const data = (await response.json()) as SessionResponse
        if (mounted) {
          setIsAuthed(Boolean(data?.user?.login))
        }
      } catch {
        // no-op
      }
    }

    void loadSession()
    return () => {
      mounted = false
    }
  }, [])

  const href = isAuthed ? '/me' : '/me/login?callbackUrl=/me'
  const label = isAuthed ? dict.common.me : dict.common.login

  return (
    <Link href={href} className={className}>
      {label}
    </Link>
  )
}
