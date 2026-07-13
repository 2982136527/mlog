import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getMediaById: vi.fn() }))
vi.mock('./repository', async importOriginal => {
  const original = await importOriginal<typeof import('./repository')>()
  return { ...original, getMediaById: mocks.getMediaById }
})

import { assertPublicationMediaReady, collectPublicationImages, managedMediaIdFromUrl } from './publication-guard'

const id = 'a'.repeat(64)
const url = `https://raw.githubusercontent.com/owner/images/main/uploads/blog/aa/${id}.png`

function change(markdown: string, cover?: string) {
  return {
    locale: 'zh' as const,
    frontmatter: { title: 'Post', date: '2026-07-13', cover },
    markdown
  }
}

beforeEach(() => {
  vi.stubEnv('IMAGE_GITHUB_OWNER', 'owner')
  vi.stubEnv('IMAGE_GITHUB_REPO', 'images')
  vi.stubEnv('IMAGE_GITHUB_BRANCH', 'main')
  vi.stubEnv('IMAGE_GITHUB_PATH_PREFIX', 'uploads/blog')
  mocks.getMediaById.mockResolvedValue({ status: 'ready', deletedAt: null, url })
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe('publication media guard', () => {
  it('extracts inline, reference-style, and cover images through the Markdown AST', () => {
    expect(collectPublicationImages([change(`![inline](${url})\n\n![ref][hero]\n\n[hero]: ${url}`, url)])).toEqual([
      { locale: 'zh', field: 'cover', url },
      { locale: 'zh', field: 'markdown', url },
      { locale: 'zh', field: 'markdown', url }
    ])
  })

  it('extracts the content hash only from the managed namespace', () => {
    expect(managedMediaIdFromUrl(url)).toBe(id)
    expect(managedMediaIdFromUrl(`https://raw.githubusercontent.com/owner/images/main/uploads/blog/ff/${id}.png`)).toBeNull()
    expect(managedMediaIdFromUrl('https://raw.githubusercontent.com/owner/images/main/other/file.png')).toBeNull()
  })

  it('allows ready canonical media, legacy local images, and external HTTPS body images', async () => {
    await expect(assertPublicationMediaReady([
      change(`![managed](${url})\n![legacy](/images/uploads/old.png)\n![external](https://example.test/image.png)`, url)
    ])).resolves.toBeUndefined()
    expect(mocks.getMediaById).toHaveBeenCalledWith(id, true)
  })

  it('blocks processing media and unverified aliases', async () => {
    mocks.getMediaById.mockResolvedValueOnce({ status: 'processing', deletedAt: null, url: null })
    await expect(assertPublicationMediaReady([change(`![pending](${url})`)]))
      .rejects.toMatchObject({ status: 409, code: 'MEDIA_NOT_READY' })

    mocks.getMediaById.mockResolvedValueOnce({
      status: 'ready',
      deletedAt: null,
      url: `https://cdn.jsdelivr.net/gh/owner/images@main/uploads/blog/aa/${id}.png`
    })
    await expect(assertPublicationMediaReady([change(`![alias](${url})`)]))
      .rejects.toMatchObject({ status: 409, code: 'MEDIA_URL_NOT_READY' })
  })

  it('blocks fabricated paths on the configured media host', async () => {
    await expect(assertPublicationMediaReady([
      change('![missing](https://raw.githubusercontent.com/owner/images/main/uploads/blog/not-real.png)')
    ])).rejects.toMatchObject({ status: 400, code: 'INVALID_MEDIA_URL' })
    expect(mocks.getMediaById).not.toHaveBeenCalled()
  })
})
