import type { Locale } from '@/i18n/config'
import { getDictionary } from '@/i18n/dictionaries'
import type { TocItem } from '@/types/content'
import { cn } from '@/lib/utils'

type PostTocProps = {
  locale: Locale
  toc: TocItem[]
}

export function PostToc({ locale, toc }: PostTocProps) {
  const dict = getDictionary(locale)

  if (toc.length === 0) {
    return null
  }

  return (
    <aside className='sticky top-8 hidden max-h-[80vh] w-72 shrink-0 overflow-auto rounded-2xl border border-white/60 bg-white/55 p-5 backdrop-blur lg:block'>
      <h2 className='font-title text-lg text-[var(--color-ink)]'>{dict.blog.tableOfContents}</h2>
      <ul className='mt-4 space-y-2 text-sm text-[var(--color-ink-soft)]'>
        {toc.map(item => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className={cn('block transition hover:text-[var(--color-brand)]', item.depth >= 3 && 'pl-4', item.depth === 2 && 'pl-2')}>
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  )
}
