'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type AdminDeleteButtonProps = {
  slug: string
}

export function AdminDeleteButton({ slug }: AdminDeleteButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const handleDelete = async () => {
    const confirmed = window.confirm(`确定要删除文章 ${slug} 的所有语言版本吗？`)
    if (!confirmed) {
      return
    }

    setLoading(true)
    setMessage(null)

    try {
      const response = await fetch(`/api/admin/posts/${encodeURIComponent(slug)}?locale=all`, {
        method: 'DELETE'
      })
      const data = (await response.json()) as { error?: { message?: string }; publish?: { prUrl: string; merged: boolean } }

      if (!response.ok) {
        throw new Error(data.error?.message || '删除失败')
      }

      setMessage(data.publish?.merged ? '已删除并合并' : '已创建删除 PR，待处理')
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '删除失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='space-y-1'>
      <button
        type='button'
        onClick={handleDelete}
        disabled={loading}
        className='rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60'>
        {loading ? '删除中...' : '删除'}
      </button>
      {message && <p className='text-[11px] text-[var(--color-ink-soft)]'>{message}</p>}
    </div>
  )
}
