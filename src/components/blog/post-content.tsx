import type { Locale } from '@/i18n/config'
import { getDictionary } from '@/i18n/dictionaries'
import type { LocalizedPost, Post } from '@/types/content'
import type { PostStaticSnapshot } from '@/types/repo-cards'
import { formatDate } from '@/lib/date'
import { TagChip } from '@/components/ui/tag-chip'
import { PostLiveCard } from '@/components/blog/post-live-card'
import { PostStaticCard } from '@/components/blog/post-static-card'
import { PostViewTracker } from '@/components/blog/post-view-tracker'

type PostContentProps = {
  locale: Locale
  post: LocalizedPost | Post
  html: string
  showRepoCards?: boolean
  staticSnapshot?: PostStaticSnapshot | null
}

export function PostContent({ locale, post, html, showRepoCards = false, staticSnapshot = null }: PostContentProps) {
  const dict = getDictionary(locale)

  return (
    <article className='prose-wrap min-w-0 rounded-3xl border border-white/65 bg-white/65 p-6 shadow-[0_24px_65px_-38px_rgba(120,45,20,0.4)] backdrop-blur sm:p-10'>
      <PostViewTracker locale={locale} slug={post.slug} title={post.frontmatter.title} />
      <div className='mb-4 flex flex-wrap gap-2'>
        <TagChip>{post.frontmatter.category}</TagChip>
        {post.frontmatter.tags.map(tag => (
          <TagChip key={tag}>#{tag}</TagChip>
        ))}
      </div>

      <h1 className='font-title text-4xl leading-tight text-[var(--color-ink)]'>{post.frontmatter.title}</h1>

      <div className='mt-4 flex flex-wrap gap-4 text-sm text-[var(--color-ink-soft)]'>
        <span>
          {dict.blog.publishedOn}: {formatDate(post.frontmatter.date, locale)}
        </span>
        {post.frontmatter.updated && (
          <span>
            {dict.blog.updatedOn}: {formatDate(post.frontmatter.updated, locale)}
          </span>
        )}
        <span>
          {dict.blog.readingTime}: {post.readingTime} min
        </span>
      </div>

      <p className='mt-6 text-lg leading-8 text-[var(--color-ink-soft)]'>{post.frontmatter.summary}</p>

      {showRepoCards && (
        <div className='mt-6 grid gap-4 lg:grid-cols-2'>
          <PostStaticCard locale={locale} snapshot={staticSnapshot} />
          <PostLiveCard locale={locale} slug={post.slug} />
        </div>
      )}

      <div className='prose mt-8' dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  )
}
