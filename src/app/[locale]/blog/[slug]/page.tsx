import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale } from '@/i18n/config'
import { getDictionary } from '@/i18n/dictionaries'
import { getAllLocalizedRouteParams, getLocalizedPost, getPostNeighbors } from '@/lib/content'
import { createLocaleMetadata } from '@/lib/metadata'
import { renderMarkdown } from '@/lib/markdown'
import { PostContent } from '@/components/blog/post-content'
import { PostToc } from '@/components/blog/post-toc'
import { PostFallbackNotice } from '@/components/blog/post-fallback-notice'
import { GiscusComments } from '@/components/blog/giscus-comments'

type BlogDetailProps = {
  params: Promise<{ locale: string; slug: string }>
}

export function generateStaticParams() {
  return getAllLocalizedRouteParams()
}

export async function generateMetadata({ params }: BlogDetailProps): Promise<Metadata> {
  const { locale, slug } = await params

  if (!isLocale(locale)) {
    return {}
  }

  const post = getLocalizedPost(locale, slug)
  if (!post) {
    return {}
  }

  return createLocaleMetadata({
    locale,
    title: post.frontmatter.title,
    description: post.frontmatter.summary,
    path: `/${locale}/blog/${slug}`
  })
}

export default async function BlogDetailPage({ params }: BlogDetailProps) {
  const { locale, slug } = await params

  if (!isLocale(locale)) {
    notFound()
  }

  const dict = getDictionary(locale)
  const post = getLocalizedPost(locale, slug)

  if (!post) {
    notFound()
  }

  const { html, toc } = await renderMarkdown(post.content)
  const neighbors = getPostNeighbors(post.locale, post.slug)

  return (
    <div className='pb-10'>
      <Link href={`/${locale}/blog`} className='mb-5 inline-flex text-sm font-medium text-[var(--color-ink-soft)] transition hover:text-[var(--color-brand)]'>
        ← {dict.common.backToBlog}
      </Link>

      {post.isFallback && <PostFallbackNotice locale={locale} />}

      <div className='flex items-start gap-6'>
        <PostContent locale={locale} post={post} html={html} />
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

      <GiscusComments />
    </div>
  )
}
