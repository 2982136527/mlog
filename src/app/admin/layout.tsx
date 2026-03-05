import Link from 'next/link'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className='relative min-h-screen pb-10' data-theme-scope='admin'>
      <div className='pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_8%_0%,#f5c389_0%,#f5c38900_40%),radial-gradient(circle_at_90%_22%,#ea9d70_0%,#ea9d7000_40%),linear-gradient(160deg,#fff8ef_0%,#fdebdc_45%,#f6decf_100%)]' />

      <header className='mx-auto flex w-full max-w-6xl items-center justify-between px-5 pt-7 pb-5 sm:px-8'>
        <div>
          <h1 className='font-title text-3xl text-[var(--color-ink)]'>MLog Admin</h1>
          <p className='text-sm text-[var(--color-ink-soft)]'>前台编辑与发布后台</p>
        </div>

        <nav className='flex items-center gap-3 text-sm text-[var(--color-ink-soft)]'>
          <Link href='/admin' className='transition hover:text-[var(--color-ink)]'>
            后台首页
          </Link>
          <Link href='/admin/new' className='transition hover:text-[var(--color-ink)]'>
            新建文章
          </Link>
          <Link href='/api/auth/signout?callbackUrl=/' className='transition hover:text-[var(--color-ink)]'>
            退出
          </Link>
        </nav>
      </header>

      <main className='mx-auto w-full max-w-6xl px-5 sm:px-8'>{children}</main>
    </div>
  )
}
