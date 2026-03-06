import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthSession } from '@/lib/auth'
import { StudioDashboard } from '@/components/studio/studio-dashboard'

export default async function StudioPage() {
  const session = await getAuthSession()
  const login = session?.user?.login?.trim()

  if (!session?.user || !login) {
    redirect('/studio/login?callbackUrl=/studio')
  }

  return (
    <div className='mx-auto max-w-6xl space-y-5 px-5 pt-8 pb-10 sm:px-8'>
      <header className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='font-title text-4xl text-[var(--color-ink)]'>MLog Studio</h1>
          <p className='text-sm text-[var(--color-ink-soft)]'>用户 BYOK 与定时发文控制台（仅生成草稿，管理员审核发布）</p>
        </div>
        <div className='flex flex-wrap gap-2 text-sm'>
          <Link href='/' className='rounded-xl border border-[var(--color-border-strong)] bg-white px-4 py-2 text-[var(--color-ink-soft)] transition hover:text-[var(--color-ink)]'>
            返回前台
          </Link>
          <Link href='/api/auth/signout?callbackUrl=/' className='rounded-xl border border-[var(--color-border-strong)] bg-white px-4 py-2 text-[var(--color-ink-soft)] transition hover:text-[var(--color-ink)]'>
            退出登录
          </Link>
        </div>
      </header>

      <StudioDashboard login={login} />
    </div>
  )
}

