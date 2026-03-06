import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthSession } from '@/lib/auth'
import { UserGitHubSignInButton } from '@/components/user/user-github-signin-button'
import type { Locale } from '@/i18n/config'

type LoginPageProps = {
  searchParams: Promise<{ callbackUrl?: string; error?: string; locale?: string }>
}

function resolveLocale(input: string | undefined): Locale {
  return input === 'en' ? 'en' : 'zh'
}

export default async function MeLoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const locale = resolveLocale(params.locale)
  const callbackUrl = params.callbackUrl || `/me?locale=${locale}`
  const authError = params.error
  const session = await getAuthSession()
  const copy =
    locale === 'zh'
      ? {
          title: '登录',
          desc: '登录后可查看历史记录，并可授权 gist 启用跨设备云同步。',
          error: 'GitHub 登录失败，请重试。',
          back: '返回前台',
          loginButton: '使用 GitHub 登录'
        }
      : {
          title: 'Login',
          desc: 'Sign in to view your activity history and optionally enable cross-device Gist sync.',
          error: 'GitHub sign-in failed. Please try again.',
          back: 'Back to Site',
          loginButton: 'Continue with GitHub'
        }

  if (session?.user?.login) {
    redirect(callbackUrl)
  }

  return (
    <div className='mx-auto mt-10 max-w-xl rounded-3xl border border-white/70 bg-white/60 p-8 backdrop-blur'>
      <h2 className='font-title text-4xl text-[var(--color-ink)]'>{copy.title}</h2>
      <p className='mt-3 text-sm leading-6 text-[var(--color-ink-soft)]'>{copy.desc}</p>

      {authError && (
        <p className='mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700'>
          {copy.error}
        </p>
      )}

      <div className='mt-6 flex flex-wrap gap-3'>
        <UserGitHubSignInButton callbackUrl={callbackUrl} requestGistScope label={copy.loginButton} />
        <Link
          href={`/${locale}`}
          className='rounded-xl border border-[var(--color-border-strong)] bg-white px-5 py-2 text-sm text-[var(--color-ink-soft)] transition hover:text-[var(--color-ink)]'>
          {copy.back}
        </Link>
      </div>
    </div>
  )
}
