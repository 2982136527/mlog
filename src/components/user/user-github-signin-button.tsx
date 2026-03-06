'use client'

import { signIn } from 'next-auth/react'

type UserGitHubSignInButtonProps = {
  callbackUrl: string
}

export function UserGitHubSignInButton({ callbackUrl }: UserGitHubSignInButtonProps) {
  return (
    <button
      type='button'
      onClick={() => signIn('github', { callbackUrl })}
      className='rounded-xl bg-[var(--color-brand)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-strong)]'>
      使用 GitHub 登录
    </button>
  )
}
