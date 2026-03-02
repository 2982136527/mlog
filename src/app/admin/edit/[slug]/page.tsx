import { notFound, redirect } from 'next/navigation'
import { getAuthSession } from '@/lib/auth'
import { isAdminLogin } from '@/lib/admin/permissions'
import { getAdminPostDetail } from '@/lib/admin/posts-service'
import { AdminPostEditor } from '@/components/admin/admin-post-editor'
import { AdminHttpError } from '@/lib/admin/errors'

type AdminEditPageProps = {
  params: Promise<{ slug: string }>
}

export default async function AdminEditPostPage({ params }: AdminEditPageProps) {
  const session = await getAuthSession()

  if (!session?.user) {
    const { slug } = await params
    redirect(`/admin/login?callbackUrl=/admin/edit/${encodeURIComponent(slug)}`)
  }

  if (!isAdminLogin(session.user.login)) {
    return <div className='rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700'>当前账号无后台权限。</div>
  }

  const { slug } = await params
  let detail = null
  let loadError: string | null = null

  try {
    detail = await getAdminPostDetail(slug)
  } catch (error) {
    if (error instanceof AdminHttpError && error.status === 404) {
      notFound()
    }
    if (error instanceof AdminHttpError) {
      loadError = error.message
    } else {
      throw error
    }
  }

  if (loadError || !detail) {
    return <div className='rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700'>{loadError || '文章加载失败'}</div>
  }

  return <AdminPostEditor mode='edit' initial={detail} />
}
