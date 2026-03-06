'use client'

import { signIn } from 'next-auth/react'

type UserGitHubSignInButtonProps = {
  callbackUrl: string
  requestGistScope?: boolean
  label?: string
}

export function UserGitHubSignInButton({
  callbackUrl,
  requestGistScope = false,
  label = '使用 GitHub 登录'
}: UserGitHubSignInButtonProps) {
  return (
    <button
      type='button'
      onClick={() =>
        requestGistScope
          ? signIn('github', { callbackUrl }, { scope: 'read:user user:email gist' })
          : signIn('github', { callbackUrl })
      }
      className='rounded-xl bg-[var(--color-brand)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-strong)]'>
      {label}
    </button>
  )
}
