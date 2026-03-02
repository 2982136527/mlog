import type { Locale } from '@/i18n/config'
import { getDictionary } from '@/i18n/dictionaries'

type PostListFiltersProps = {
  locale: Locale
  tags: string[]
  categories: string[]
  selectedTag?: string
  selectedCategory?: string
  query?: string
}

export function PostListFilters({ locale, tags, categories, selectedTag, selectedCategory, query }: PostListFiltersProps) {
  const dict = getDictionary(locale)

  return (
    <form className='grid gap-3 rounded-2xl border border-white/60 bg-white/60 p-4 backdrop-blur sm:grid-cols-3' method='get'>
      <label className='text-xs font-medium text-[var(--color-ink-soft)]'>
        <span className='mb-1 block'>{dict.blog.searchPlaceholder}</span>
        <input
          type='text'
          name='q'
          defaultValue={query}
          placeholder={dict.blog.searchPlaceholder}
          className='w-full rounded-xl border border-[var(--color-border-strong)] bg-white/70 px-3 py-2 text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-brand)]'
        />
      </label>

      <label className='text-xs font-medium text-[var(--color-ink-soft)]'>
        <span className='mb-1 block'>{dict.common.tags}</span>
        <select
          name='tag'
          defaultValue={selectedTag ?? ''}
          className='w-full rounded-xl border border-[var(--color-border-strong)] bg-white/70 px-3 py-2 text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-brand)]'>
          <option value=''>{dict.blog.allTags}</option>
          {tags.map(tag => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      </label>

      <label className='text-xs font-medium text-[var(--color-ink-soft)]'>
        <span className='mb-1 block'>{dict.common.categories}</span>
        <select
          name='category'
          defaultValue={selectedCategory ?? ''}
          className='w-full rounded-xl border border-[var(--color-border-strong)] bg-white/70 px-3 py-2 text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-brand)]'>
          <option value=''>{dict.blog.allCategories}</option>
          {categories.map(category => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </label>

      <div className='sm:col-span-3'>
        <button
          type='submit'
          className='inline-flex items-center rounded-full bg-[var(--color-brand)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-strong)]'>
          Filter
        </button>
      </div>
    </form>
  )
}
