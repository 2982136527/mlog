import { redirect } from 'next/navigation'
import { getAuthSession } from '@/lib/auth'
import { isAdminLogin } from '@/lib/admin/permissions'
import { getEmptyAdminPost } from '@/lib/admin/posts-service'
import { AdminPostEditor } from '@/components/admin/admin-post-editor'

export default async function AdminNewPostPage() {
  const session = await getAuthSession()

  if (!session?.user) {
    redirect('/admin/login?callbackUrl=/admin/new')
  }

  if (!isAdminLogin(session.user.login)) {
    return <div className='rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700'>当前账号无后台权限。</div>
  }

  return <AdminPostEditor mode='new' initial={getEmptyAdminPost()} />
}
