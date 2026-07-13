import { redirect } from 'next/navigation'
import { getAuthSession } from '@/lib/auth'
import { isAdminLogin } from '@/lib/admin/permissions'
import { AdminMediaLibrary } from '@/components/admin/admin-media-library'

export default async function AdminMediaPage() {
  const session = await getAuthSession()

  if (!session?.user) {
    redirect('/admin/login?callbackUrl=/admin/media')
  }

  if (!isAdminLogin(session.user.login)) {
    return <div className='rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700'>当前账号无后台权限。</div>
  }

  return (
    <div className='space-y-5'>
      <header className='flex flex-wrap items-end justify-between gap-3 border-b border-white/70 pb-4'>
        <div>
          <h2 className='font-title text-3xl text-[var(--color-ink)]'>媒体库</h2>
          <p className='mt-1 text-sm text-[var(--color-ink-soft)]'>管理员：@{session.user.login}</p>
        </div>
      </header>
      <AdminMediaLibrary />
    </div>
  )
}
