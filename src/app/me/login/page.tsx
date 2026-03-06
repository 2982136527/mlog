import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthSession } from '@/lib/auth'
import { UserGitHubSignInButton } from '@/components/user/user-github-signin-button'

type LoginPageProps = {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>
}

export default async function MeLoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const callbackUrl = params.callbackUrl || '/me'
  const authError = params.error
  const session = await getAuthSession()

  if (session?.user?.login) {
    redirect(callbackUrl)
  }

  return (
    <div className='mx-auto mt-10 max-w-xl rounded-3xl border border-white/70 bg-white/60 p-8 backdrop-blur'>
      <h2 className='font-title text-4xl text-[var(--color-ink)]'>登录</h2>
      <p className='mt-3 text-sm leading-6 text-[var(--color-ink-soft)]'>登录后可查看你的阅读历史与评论交互记录。</p>

      {authError && (
        <p className='mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700'>
          GitHub 登录失败，请重试。
        </p>
      )}

      <div className='mt-6 flex flex-wrap gap-3'>
        <UserGitHubSignInButton callbackUrl={callbackUrl} />
        <Link
          href='/'
          className='rounded-xl border border-[var(--color-border-strong)] bg-white px-5 py-2 text-sm text-[var(--color-ink-soft)] transition hover:text-[var(--color-ink)]'>
          返回前台
        </Link>
      </div>
    </div>
  )
}
