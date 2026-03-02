import Link from 'next/link'
import type { Locale } from '@/i18n/config'

type PaginationProps = {
  locale: Locale
  page: number
  totalPages: number
  basePath: string
  query: {
    q?: string
    tag?: string
    category?: string
  }
}

function buildHref(basePath: string, page: number, query: PaginationProps['query']): string {
  const params = new URLSearchParams()

  if (query.q) params.set('q', query.q)
  if (query.tag) params.set('tag', query.tag)
  if (query.category) params.set('category', query.category)
  if (page > 1) params.set('page', String(page))

  const serialized = params.toString()
  return serialized ? `${basePath}?${serialized}` : basePath
}

export function Pagination({ page, totalPages, basePath, query }: PaginationProps) {
  if (totalPages <= 1) {
    return null
  }

  return (
    <div className='mt-8 flex items-center justify-between rounded-2xl border border-white/60 bg-white/50 px-4 py-3 text-sm text-[var(--color-ink-soft)] backdrop-blur'>
      <Link
        href={buildHref(basePath, page - 1, query)}
        className={page <= 1 ? 'pointer-events-none opacity-40' : 'font-medium text-[var(--color-ink)] hover:text-[var(--color-brand)]'}>
        Previous
      </Link>

      <span>
        {page} / {totalPages}
      </span>

      <Link
        href={buildHref(basePath, page + 1, query)}
        className={page >= totalPages ? 'pointer-events-none opacity-40' : 'font-medium text-[var(--color-ink)] hover:text-[var(--color-brand)]'}>
        Next
      </Link>
    </div>
  )
}
