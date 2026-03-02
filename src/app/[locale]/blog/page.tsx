import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale } from '@/i18n/config'
import { getDictionary } from '@/i18n/dictionaries'
import { getLocaleCategories, getLocaleTags, getPostsByLocale, paginatePosts } from '@/lib/content'
import { createLocaleMetadata } from '@/lib/metadata'
import { PostCard } from '@/components/blog/post-card'
import { PostListFilters } from '@/components/blog/post-list-filters'
import { Pagination } from '@/components/blog/pagination'

type BlogListProps = {
  params: Promise<{ locale: string }>
  searchParams: Promise<{
    q?: string
    tag?: string
    category?: string
    page?: string
  }>
}

const PAGE_SIZE = 8

export async function generateMetadata({ params }: BlogListProps): Promise<Metadata> {
  const { locale } = await params

  if (!isLocale(locale)) {
    return {}
  }

  const dict = getDictionary(locale)

  return createLocaleMetadata({
    locale,
    title: dict.blog.title,
    description: dict.blog.description,
    path: `/${locale}/blog`
  })
}

export default async function BlogListPage({ params, searchParams }: BlogListProps) {
  const { locale } = await params
  const query = await searchParams

  if (!isLocale(locale)) {
    notFound()
  }

  const dict = getDictionary(locale)
  const q = query.q?.trim().toLowerCase() ?? ''
  const selectedTag = query.tag?.trim() || ''
  const selectedCategory = query.category?.trim() || ''
  const pageNumber = Number(query.page ?? '1')

  const posts = getPostsByLocale(locale)
  const tags = getLocaleTags(locale)
  const categories = getLocaleCategories(locale)

  const filtered = posts.filter(post => {
    const matchesQuery =
      !q ||
      post.frontmatter.title.toLowerCase().includes(q) ||
      post.frontmatter.summary.toLowerCase().includes(q) ||
      post.frontmatter.tags.some(tag => tag.toLowerCase().includes(q))

    const matchesTag = !selectedTag || post.frontmatter.tags.includes(selectedTag)
    const matchesCategory = !selectedCategory || post.frontmatter.category === selectedCategory

    return matchesQuery && matchesTag && matchesCategory
  })

  const pagination = paginatePosts(filtered, pageNumber, PAGE_SIZE)

  return (
    <div className='pb-10'>
      <div className='mb-6'>
        <h1 className='font-title text-4xl text-[var(--color-ink)]'>{dict.blog.title}</h1>
        <p className='mt-2 text-sm text-[var(--color-ink-soft)]'>{dict.blog.description}</p>
      </div>

      <PostListFilters locale={locale} tags={tags} categories={categories} selectedTag={selectedTag} selectedCategory={selectedCategory} query={query.q} />

      {pagination.items.length > 0 ? (
        <div className='mt-6 grid gap-4 sm:grid-cols-2'>
          {pagination.items.map(post => (
            <PostCard key={`${post.locale}-${post.slug}`} locale={locale} post={post} />
          ))}
        </div>
      ) : (
        <p className='mt-8 rounded-2xl border border-white/60 bg-white/60 p-4 text-sm text-[var(--color-ink-soft)]'>{dict.blog.empty}</p>
      )}

      <Pagination
        locale={locale}
        page={pagination.page}
        totalPages={pagination.totalPages}
        basePath={`/${locale}/blog`}
        query={{ q: query.q, tag: selectedTag, category: selectedCategory }}
      />
    </div>
  )
}
