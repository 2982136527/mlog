import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthSession } from '@/lib/auth'
import { isAdminLogin } from '@/lib/admin/permissions'
import { listAdminPosts } from '@/lib/admin/posts-service'
import { AdminDeleteButton } from '@/components/admin/admin-delete-button'
import { AdminAutomationCard } from '@/components/admin/admin-automation-card'
import { AdminTutorialSyncCard } from '@/components/admin/admin-tutorial-sync-card'
import { AdminHttpError } from '@/lib/admin/errors'
import type { AdminPostSummary } from '@/types/admin'

type AdminPageProps = {
  searchParams: Promise<{
    keyword?: string
    status?: 'draft' | 'published' | 'all'
    locale?: 'zh' | 'en'
  }>
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const session = await getAuthSession()

  if (!session?.user) {
    redirect('/admin/login?callbackUrl=/admin')
  }

  if (!isAdminLogin(session.user.login)) {
    return <div className='rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700'>当前账号无后台权限。</div>
  }

  const params = await searchParams
  const status = params.status || 'all'
  const locale = params.locale
  const keyword = params.keyword || ''
  let posts: AdminPostSummary[] = []
  let loadError: string | null = null

  try {
    posts = await listAdminPosts({
      status,
      locale,
      keyword
    })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      loadError = error.message
    } else {
      loadError = '后台读取失败，请检查 GitHub 环境变量配置。'
    }
  }

  return (
    <div className='space-y-5'>
      <section className='rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h2 className='font-title text-3xl text-[var(--color-ink)]'>文章管理</h2>
            <p className='text-sm text-[var(--color-ink-soft)]'>管理员：@{session.user.login}</p>
          </div>

          <Link
            href='/admin/new'
            className='rounded-xl bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-strong)]'>
            新建文章
          </Link>
        </div>
      </section>

      <AdminAutomationCard />
      <AdminTutorialSyncCard />

      <form className='grid gap-3 rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur sm:grid-cols-4'>
        <label className='text-xs text-[var(--color-ink-soft)] sm:col-span-2'>
          关键词
          <input
            name='keyword'
            defaultValue={keyword}
            placeholder='搜索 slug / 标题 / 摘要'
            className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] outline-none'
          />
        </label>

        <label className='text-xs text-[var(--color-ink-soft)]'>
          状态
          <select name='status' defaultValue={status} className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)]'>
            <option value='all'>全部</option>
            <option value='published'>已发布</option>
            <option value='draft'>草稿</option>
          </select>
        </label>

        <label className='text-xs text-[var(--color-ink-soft)]'>
          语言
          <select name='locale' defaultValue={locale || ''} className='mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)]'>
            <option value=''>全部</option>
            <option value='zh'>中文</option>
            <option value='en'>英文</option>
          </select>
        </label>

        <div className='sm:col-span-4'>
          <button type='submit' className='rounded-xl border border-[var(--color-border-strong)] bg-white px-4 py-2 text-sm text-[var(--color-ink)] transition hover:border-[var(--color-brand)]'>
            筛选
          </button>
        </div>
      </form>

      <section className='rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur'>
        {loadError && <p className='mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>{loadError}</p>}
        <div className='overflow-x-auto'>
          <table className='min-w-full text-left text-sm'>
            <thead className='text-xs text-[var(--color-ink-soft)]'>
              <tr>
                <th className='px-3 py-2'>Slug</th>
                <th className='px-3 py-2'>标题</th>
                <th className='px-3 py-2'>语言</th>
                <th className='px-3 py-2'>状态</th>
                <th className='px-3 py-2'>更新时间</th>
                <th className='px-3 py-2'>操作</th>
              </tr>
            </thead>
            <tbody>
              {posts.length === 0 ? (
                <tr>
                  <td className='px-3 py-6 text-[var(--color-ink-soft)]' colSpan={6}>
                    没有匹配的数据。
                  </td>
                </tr>
              ) : (
                posts.map(post => (
                  <tr key={post.slug} className='border-t border-white/70'>
                    <td className='px-3 py-3 font-medium text-[var(--color-ink)]'>{post.slug}</td>
                    <td className='px-3 py-3 text-[var(--color-ink)]'>{post.title}</td>
                    <td className='px-3 py-3 text-[var(--color-ink-soft)]'>
                      <div className='flex gap-2'>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${post.hasZh ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>ZH</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${post.hasEn ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>EN</span>
                      </div>
                    </td>
                    <td className='px-3 py-3 text-[var(--color-ink-soft)]'>
                      {post.draft ? <span className='rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700'>草稿</span> : <span className='rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700'>发布</span>}
                    </td>
                    <td className='px-3 py-3 text-[var(--color-ink-soft)]'>{post.updatedAt || '-'}</td>
                    <td className='px-3 py-3'>
                      <div className='flex items-center gap-2'>
                        <Link href={`/admin/edit/${encodeURIComponent(post.slug)}`} className='rounded-lg border border-[var(--color-border-strong)] bg-white px-2 py-1 text-xs text-[var(--color-ink)] transition hover:border-[var(--color-brand)]'>
                          编辑
                        </Link>
                        <AdminDeleteButton slug={post.slug} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
