import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, locales } from '@/i18n/config'
import { getDictionary } from '@/i18n/dictionaries'
import {
  getLocalizedPostAsync,
  getPostAsync,
  getPostNeighborsAsync,
  getPostContentAsync,
  getRepoCardsConfigAsync
} from '@/lib/content'
import { createLocaleMetadata } from '@/lib/metadata'
import { renderMarkdown } from '@/lib/markdown'
import { PostContent } from '@/components/blog/post-content'
import { PostToc } from '@/components/blog/post-toc'
import { PostFallbackNotice } from '@/components/blog/post-fallback-notice'
import { GiscusComments } from '@/components/blog/giscus-comments'
import {
  extractHotDailyStaticSnapshot,
  isHotDailyTags,
  stripConfirmedFactsSection,
  toPostStaticSnapshotFromRepoCards
} from '@/lib/blog/static-snapshot'

type BlogDetailProps = {
  params: Promise<{ locale: string; slug: string }>
}

export async function generateMetadata({ params }: BlogDetailProps): Promise<Metadata> {
  const { locale, slug } = await params

  if (!isLocale(locale)) {
    return {}
  }

  const post = await getLocalizedPostAsync(locale, slug)
  if (!post) {
    return {}
  }

  return createLocaleMetadata({
    locale,
    title: post.frontmatter.title,
    description: post.frontmatter.summary,
    path: `/${locale}/blog/${slug}`,
    image: post.frontmatter.cover
  })
}

export default async function BlogDetailPage({ params }: BlogDetailProps) {
  const { locale, slug } = await params

  if (!isLocale(locale)) {
    notFound()
  }

  const dict = getDictionary(locale)
  const post = await getLocalizedPostAsync(locale, slug)

  if (!post) {
    notFound()
  }

  const [repoCardsConfig, zhSource, neighbors, content] = await Promise.all([
    getRepoCardsConfigAsync(post.slug),
    getPostAsync('zh', post.slug),
    getPostNeighborsAsync(post.locale, post.slug),
    getPostContentAsync(slug, locale).then(c => c || '')
  ])
  const isHotDaily = isHotDailyTags(post.frontmatter.tags)
  const showRepoCards = isHotDaily || repoCardsConfig.enabled

  // For hot daily articles, get the zh source content
  const zhContent = isHotDaily && zhSource ? await getPostContentAsync(slug, 'zh') : null

  const staticSnapshot = (() => {
    const fromConfig = toPostStaticSnapshotFromRepoCards(repoCardsConfig)
    if (fromConfig) {
      return fromConfig
    }

    if (!isHotDaily) {
      return null
    }

    const sourceContent = locale === 'zh' ? content : (zhContent || content)
    return extractHotDailyStaticSnapshot(sourceContent, (zhSource || post).frontmatter.updated || post.frontmatter.date)
  })()

  const renderInput = showRepoCards ? stripConfirmedFactsSection(content).markdown : content
  const { html, toc } = await renderMarkdown(renderInput)

  return (
    <div className='pb-10'>
      <Link href={`/${locale}/blog`} className='mb-5 inline-flex text-sm font-medium text-[var(--color-ink-soft)] transition hover:text-[var(--color-brand)]'>
        ← {dict.common.backToBlog}
      </Link>

      {post.isFallback && <PostFallbackNotice locale={locale} />}

      <div className='flex items-start gap-6'>
        <PostContent locale={locale} post={post} html={html} showRepoCards={showRepoCards} staticSnapshot={staticSnapshot} />
        <PostToc locale={locale} toc={toc} />
      </div>

      <div className='mt-8 grid gap-3 sm:grid-cols-2'>
        <div className='rounded-2xl border border-white/60 bg-white/50 p-4 text-sm text-[var(--color-ink-soft)] backdrop-blur'>
          {neighbors.prev ? (
            <Link href={`/${locale}/blog/${neighbors.prev.slug}`} className='transition hover:text-[var(--color-brand)]'>
              {dict.blog.prev}: {neighbors.prev.frontmatter.title}
            </Link>
          ) : (
            <span>{dict.blog.prev}: -</span>
          )}
        </div>

        <div className='rounded-2xl border border-white/60 bg-white/50 p-4 text-sm text-[var(--color-ink-soft)] backdrop-blur'>
          {neighbors.next ? (
            <Link href={`/${locale}/blog/${neighbors.next.slug}`} className='transition hover:text-[var(--color-brand)]'>
              {dict.blog.next}: {neighbors.next.frontmatter.title}
            </Link>
          ) : (
            <span>{dict.blog.next}: -</span>
          )}
        </div>
      </div>

      <GiscusComments locale={locale} slug={post.slug} title={post.frontmatter.title} />
    </div>
  )
}



export const revalidate = 60
