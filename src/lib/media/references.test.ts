import { describe, expect, it } from 'vitest'
import type { Post } from '@/types/content'
import type { StoredMediaAsset } from './repository'
import { scanPostsForMediaReferences } from './references'

const url = 'https://img.example.test/uploads/blog/aa/hash.png'

function asset(): StoredMediaAsset {
  return {
    id: 'a'.repeat(64),
    sha256: 'a'.repeat(64),
    path: 'uploads/blog/aa/hash.png',
    locator: { owner: 'owner', repo: 'images', branch: 'main', pathPrefix: 'uploads/blog' },
    mimeType: 'image/png',
    originalName: 'hash.png',
    alt: 'Hash',
    size: 10,
    width: 1,
    height: 1,
    frames: 1,
    uploaderLogin: 'admin',
    status: 'ready',
    url,
    candidateKind: 'custom-cdn',
    candidates: [
      { kind: 'custom-cdn', url },
      { kind: 'github-raw', url: 'https://raw.githubusercontent.com/owner/images/main/uploads/blog/aa/hash.png' }
    ],
    availabilityCheckedAt: '2026-07-13T00:00:00.000Z',
    processingStartedAt: null,
    errorCode: null,
    errorMessage: null,
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T00:00:00.000Z',
    deletedAt: null
  }
}

function post(patch: Partial<Post>): Post {
  return {
    slug: 'example',
    locale: 'zh',
    frontmatter: {
      title: 'Example',
      date: '2026-07-13',
      summary: 'Summary',
      tags: ['test'],
      category: 'Test',
      draft: true
    },
    content: '',
    readingTime: 1,
    ...patch
  }
}

describe('media reference scanner', () => {
  it('finds cover and Markdown image references in drafts and URL aliases', () => {
    const posts = [
      post({ frontmatter: { ...post({}).frontmatter, cover: `${url}?cache=1` } }),
      post({
        slug: 'english',
        locale: 'en',
        content: '![raw alias](https://raw.githubusercontent.com/owner/images/main/uploads/blog/aa/hash.png)'
      })
    ]

    const matches = scanPostsForMediaReferences(posts, [asset()]).get('a'.repeat(64))
    expect(matches).toEqual([
      expect.objectContaining({ slug: 'example', locale: 'zh', field: 'cover', draft: true }),
      expect.objectContaining({ slug: 'english', locale: 'en', field: 'markdown', draft: true })
    ])
  })

  it('finds reference-style Markdown images and every duplicate definition conservatively', () => {
    const rawAlias = 'https://raw.githubusercontent.com/owner/images/main/uploads/blog/aa/hash.png'
    const matches = scanPostsForMediaReferences([
      post({
        content: [
          '![managed image][hero]',
          '',
          '[hero]: https://example.test/unrelated.png',
          `[hero]: ${rawAlias}`
        ].join('\n')
      })
    ], [asset()]).get('a'.repeat(64))

    expect(matches).toEqual([
      expect.objectContaining({ slug: 'example', locale: 'zh', field: 'markdown', source: rawAlias })
    ])
  })

  it('does not count ordinary links or text containing the URL', () => {
    const matches = scanPostsForMediaReferences([
      post({ content: `[link](${url})\n\n${url}` })
    ], [asset()]).get('a'.repeat(64))
    expect(matches).toEqual([])
  })
})
