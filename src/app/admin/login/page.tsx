import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthSession } from '@/lib/auth'
import { isAdminLogin } from '@/lib/admin/permissions'

type LoginPageProps = {
  searchParams: Promise<{ callbackUrl?: string }>
}

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const callbackUrl = params.callbackUrl || '/admin'
  const session = await getAuthSession()

  if (session?.user?.login && isAdminLogin(session.user.login)) {
    redirect(callbackUrl)
  }

  const signedInButNoAccess = Boolean(session?.user?.login) && !isAdminLogin(session?.user?.login)

  return (
    <div className='mx-auto mt-10 max-w-xl rounded-3xl border border-white/70 bg-white/60 p-8 backdrop-blur'>
      <h2 className='font-title text-4xl text-[var(--color-ink)]'>管理员登录</h2>
      <p className='mt-3 text-sm leading-6 text-[var(--color-ink-soft)]'>使用 GitHub 登录并通过管理员白名单校验后，才能进入后台编辑与发布。</p>

      {signedInButNoAccess && (
        <p className='mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>
          当前账号 @{session?.user?.login} 不在管理员白名单中。
        </p>
      )}

      <div className='mt-6 flex flex-wrap gap-3'>
        <a
          href={`/api/auth/signin/github?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          className='rounded-xl bg-[var(--color-brand)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-strong)]'>
          使用 GitHub 登录
        </a>

        <Link
          href='/'
          className='rounded-xl border border-[var(--color-border-strong)] bg-white px-5 py-2 text-sm text-[var(--color-ink-soft)] transition hover:text-[var(--color-ink)]'>
          返回前台
        </Link>
      </div>
    </div>
  )
}
