import 'server-only'
import { revalidatePath, revalidateTag } from 'next/cache'
import { locales } from '@/i18n/config'
import { PUBLIC_CONTENT_CACHE_TAG } from '@/lib/content/cache'

const POST_PATH_RE = /^content\/posts\/([a-z0-9-]+)\//

export function revalidatePublicContent(changedPaths: string[]): boolean {
  const slugs = Array.from(
    new Set(
      changedPaths
        .map(path => path.match(POST_PATH_RE)?.[1])
        .filter((slug): slug is string => Boolean(slug))
    )
  )

  if (slugs.length === 0) {
    return false
  }

  revalidateTag(PUBLIC_CONTENT_CACHE_TAG, { expire: 0 })
  revalidatePath('/sitemap.xml')

  for (const locale of locales) {
    revalidatePath(`/${locale}`)
    revalidatePath(`/${locale}/blog`)
    revalidatePath(`/${locale}/rss.xml`)
    for (const slug of slugs) {
      revalidatePath(`/${locale}/blog/${slug}`)
    }
  }

  return true
}

async function warmPath(baseUrl: string, path: string, timeoutMs = 30_000): Promise<void> {
  try {
    await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(timeoutMs) })
  } catch {
    // Retry once on failure (e.g. timeout, network blip)
    try {
      await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(timeoutMs) })
    } catch {
      // Silent fail — ISR will catch up on next visitor request
    }
  }
}

export async function warmupPublishedPages(
  baseUrl: string,
  slug: string,
): Promise<void> {
  const paths: string[] = []

  for (const locale of locales) {
    paths.push(`/${locale}`)
    paths.push(`/${locale}/blog`)
    paths.push(`/${locale}/blog/${slug}`)
    paths.push(`/${locale}/rss.xml`)
  }
  paths.push('/sitemap.xml')

  const uniquePaths = [...new Set(paths)]

  const fireWarmup = () =>
    Promise.allSettled(uniquePaths.map(p => warmPath(baseUrl, p)))

  // Four rounds with increasing delays to account for GitHub CDN propagation:
  // Round 1: immediate — kick off ISR rendering ASAP
  // Round 2: 3s later — CDN should be ready in most cases
  // Round 3: 8s later — catch typical propagation lag
  // Round 4: 20s later — catch long tail; also serves as a keepalive for the ISR cache
  for (const delayMs of [0, 3_000, 8_000, 20_000]) {
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
    await fireWarmup()
  }
}
