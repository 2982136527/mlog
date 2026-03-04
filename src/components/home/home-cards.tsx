'use client'

import Link from 'next/link'
import { motion, type Variants } from 'framer-motion'
import type { Locale } from '@/i18n/config'
import { getDictionary } from '@/i18n/dictionaries'
import type { PostFrontmatter } from '@/types/content'
import { GlassCard } from '@/components/ui/glass-card'
import { SectionTitle } from '@/components/ui/section-title'
import { TagChip } from '@/components/ui/tag-chip'
import { formatDate } from '@/lib/date'

type HomeLatestPost = {
  slug: string
  frontmatter: Pick<PostFrontmatter, 'title' | 'summary' | 'date'>
}

type HomeCardsProps = {
  locale: Locale
  latestPost: HomeLatestPost | null
  categories: Array<{ name: string; count: number }>
  tagCounts: Array<{ name: string; count: number }>
}

function getTagToneClass(count: number, maxCount: number): string {
  if (maxCount <= 0) {
    return 'text-xs border-white/70 bg-white/60'
  }

  const ratio = count / maxCount
  if (ratio >= 0.67) {
    return 'text-sm font-semibold border-[#f7c36b]/80 bg-[#fff1d6]/95'
  }
  if (ratio >= 0.34) {
    return 'text-sm font-medium border-white/75 bg-white/75'
  }
  return 'text-xs font-medium border-white/65 bg-white/60'
}

const container: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1
    }
  }
}

const item: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 180,
      damping: 18
    }
  }
}

export function HomeCards({ locale, latestPost, categories, tagCounts }: HomeCardsProps) {
  const dict = getDictionary(locale)
  const topTags = tagCounts.slice(0, 12)
  const maxTagCount = topTags[0]?.count ?? 0

  return (
    <motion.div
      variants={container}
      initial='hidden'
      animate='show'
      className='mx-auto grid w-full max-w-6xl grid-cols-1 gap-5 px-5 pt-5 sm:grid-cols-12 sm:px-8'>
      <motion.div variants={item} className='sm:col-span-7'>
        <GlassCard className='h-full'>
          <SectionTitle>{dict.home.introTitle}</SectionTitle>
          <p className='mt-4 max-w-xl text-base leading-7 text-[var(--color-ink-soft)]'>{dict.home.introBody}</p>
          <div className='mt-7 flex flex-wrap gap-2'>
            <TagChip>Next.js 16</TagChip>
            <TagChip>Tailwind v4</TagChip>
            <TagChip>Glassmorphism</TagChip>
          </div>
        </GlassCard>
      </motion.div>

      <motion.div variants={item} className='sm:col-span-5'>
        <GlassCard className='h-full'>
          <SectionTitle>{dict.home.latestPost}</SectionTitle>

          {latestPost ? (
            <div className='mt-4'>
              <h3 className='font-title text-2xl leading-tight text-[var(--color-ink)]'>{latestPost.frontmatter.title}</h3>
              <p className='mt-3 line-clamp-3 text-sm leading-6 text-[var(--color-ink-soft)]'>{latestPost.frontmatter.summary}</p>
              <div className='mt-5 text-sm text-[var(--color-ink-soft)]'>{formatDate(latestPost.frontmatter.date, locale)}</div>
              <Link
                href={`/${locale}/blog/${latestPost.slug}`}
                className='mt-5 inline-flex rounded-full bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-strong)]'>
                {dict.home.readMore}
              </Link>
            </div>
          ) : (
            <p className='mt-4 text-sm text-[var(--color-ink-soft)]'>No posts yet.</p>
          )}
        </GlassCard>
      </motion.div>

      <motion.div variants={item} className='sm:col-span-4'>
        <GlassCard className='h-full'>
          <SectionTitle>{dict.home.browseByCategory}</SectionTitle>
          <ul className='mt-4 space-y-2'>
            {categories.slice(0, 5).map(category => (
              <li key={category.name}>
                <Link
                  href={`/${locale}/blog?category=${encodeURIComponent(category.name)}`}
                  className='flex items-center justify-between rounded-xl border border-white/70 bg-white/45 px-3 py-2 text-sm text-[var(--color-ink)] transition hover:border-[var(--color-brand)]'>
                  <span>{category.name}</span>
                  <span className='text-[var(--color-ink-soft)]'>{category.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </GlassCard>
      </motion.div>

      <motion.div variants={item} className='sm:col-span-4'>
        <GlassCard className='h-full'>
          <SectionTitle>{dict.home.quickLinks}</SectionTitle>
          <div className='mt-4 flex flex-wrap gap-3'>
            <Link
              href={`/${locale}/about`}
              className='rounded-full border border-white/70 bg-white/70 px-4 py-2 text-sm font-medium text-[var(--color-ink)] transition hover:border-[var(--color-brand)]'>
              {dict.common.about}
            </Link>
            <Link
              href={`/${locale}/blog`}
              className='rounded-full border border-white/70 bg-white/70 px-4 py-2 text-sm font-medium text-[var(--color-ink)] transition hover:border-[var(--color-brand)]'>
              {dict.nav.blog}
            </Link>
            <Link
              href={`/${locale}/rss.xml`}
              className='rounded-full border border-white/70 bg-white/70 px-4 py-2 text-sm font-medium text-[var(--color-ink)] transition hover:border-[var(--color-brand)]'>
              {dict.common.rss}
            </Link>
            <a
              href='https://github.com/qiuhu'
              target='_blank'
              rel='noreferrer'
              className='rounded-full border border-white/70 bg-white/70 px-4 py-2 text-sm font-medium text-[var(--color-ink)] transition hover:border-[var(--color-brand)]'>
              GitHub
            </a>
          </div>
        </GlassCard>
      </motion.div>

      <motion.div variants={item} className='sm:col-span-4'>
        <GlassCard className='h-full'>
          <SectionTitle>{dict.home.tagCloud}</SectionTitle>
          {topTags.length > 0 ? (
            <ul className='mt-4 flex flex-wrap gap-2'>
              {topTags.map(tag => (
                <li key={tag.name}>
                  <Link
                    href={`/${locale}/blog?tag=${encodeURIComponent(tag.name)}`}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[var(--color-ink)] transition hover:border-[var(--color-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] ${getTagToneClass(tag.count, maxTagCount)}`}>
                    <span>{tag.name}</span>
                    <span className='text-xs text-[var(--color-ink-soft)]'>{tag.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className='mt-4 text-sm text-[var(--color-ink-soft)]'>{dict.home.tagCloudEmpty}</p>
          )}
        </GlassCard>
      </motion.div>
    </motion.div>
  )
}
