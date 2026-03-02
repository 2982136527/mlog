import Link from 'next/link'
import type { Locale } from '@/i18n/config'
import type { Post } from '@/types/content'
import { formatDate } from '@/lib/date'
import { TagChip } from '@/components/ui/tag-chip'
import { GlassCard } from '@/components/ui/glass-card'

type PostCardProps = {
  locale: Locale
  post: Post
}

export function PostCard({ locale, post }: PostCardProps) {
  return (
    <GlassCard className='group p-0'>
      <Link href={`/${locale}/blog/${post.slug}`} className='block p-6 sm:p-7'>
        <div className='mb-4 flex flex-wrap gap-2'>
          <TagChip>{post.frontmatter.category}</TagChip>
          {post.frontmatter.tags.map(tag => (
            <TagChip key={tag} className='bg-white/45'>
              #{tag}
            </TagChip>
          ))}
        </div>

        <h3 className='font-title text-2xl leading-tight text-[var(--color-ink)] transition group-hover:text-[var(--color-brand)]'>
          {post.frontmatter.title}
        </h3>

        <p className='mt-3 line-clamp-2 text-sm leading-6 text-[var(--color-ink-soft)]'>{post.frontmatter.summary}</p>

        <div className='mt-5 flex items-center justify-between text-sm text-[var(--color-ink-soft)]'>
          <span>{formatDate(post.frontmatter.date, locale)}</span>
          <span>{post.readingTime} min</span>
        </div>
      </Link>
    </GlassCard>
  )
}
