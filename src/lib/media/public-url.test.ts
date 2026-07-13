import { afterEach, describe, expect, it, vi } from 'vitest'
import { isAllowedPublicMediaUrl, toAbsolutePublicMediaUrl } from './public-url'

afterEach(() => {
  vi.unstubAllEnvs()
})

function configureRepository() {
  vi.stubEnv('IMAGE_GITHUB_OWNER', 'owner')
  vi.stubEnv('IMAGE_GITHUB_REPO', 'images')
  vi.stubEnv('IMAGE_GITHUB_BRANCH', 'main')
}

describe('public media URL policy', () => {
  it('allows only safe local image paths', () => {
    expect(isAllowedPublicMediaUrl('/images/uploads/cover.png')).toBe(true)
    expect(isAllowedPublicMediaUrl('/images/%2e%2e/secret.png')).toBe(false)
    expect(isAllowedPublicMediaUrl('//attacker.test/images/cover.png')).toBe(false)
    expect(isAllowedPublicMediaUrl('/api/private')).toBe(false)
  })

  it('pins Raw GitHub and jsDelivr URLs to the configured repository and branch', () => {
    configureRepository()
    expect(isAllowedPublicMediaUrl('https://raw.githubusercontent.com/owner/images/main/uploads/blog/a.png')).toBe(true)
    expect(isAllowedPublicMediaUrl('https://cdn.jsdelivr.net/gh/owner/images@main/uploads/blog/a.png')).toBe(true)
    expect(isAllowedPublicMediaUrl('https://raw.githubusercontent.com/other/images/main/uploads/blog/a.png')).toBe(false)
    expect(isAllowedPublicMediaUrl('http://raw.githubusercontent.com/owner/images/main/uploads/blog/a.png')).toBe(false)
  })

  it('matches encoded slash branches exactly', () => {
    configureRepository()
    vi.stubEnv('IMAGE_GITHUB_BRANCH', 'media/main')
    expect(isAllowedPublicMediaUrl('https://raw.githubusercontent.com/owner/images/media%2Fmain/uploads/blog/a.png')).toBe(true)
    expect(isAllowedPublicMediaUrl('https://cdn.jsdelivr.net/gh/owner/images@media%2Fmain/uploads/blog/a.png')).toBe(true)
    expect(isAllowedPublicMediaUrl('https://raw.githubusercontent.com/owner/images/media/main/uploads/blog/a.png')).toBe(false)
  })

  it('restricts a custom CDN to its configured origin and path', () => {
    vi.stubEnv('NEXT_PUBLIC_CDN_BASE_URL', 'https://img.example.test/mlog')
    expect(isAllowedPublicMediaUrl('https://img.example.test/mlog/uploads/blog/a.png')).toBe(true)
    expect(isAllowedPublicMediaUrl('https://img.example.test/other/a.png')).toBe(false)
    expect(isAllowedPublicMediaUrl('https://img.example.test.evil.test/mlog/a.png')).toBe(false)
  })

  it('keeps explicitly listed historical repositories renderable after rotation', () => {
    configureRepository()
    vi.stubEnv('IMAGE_GITHUB_REPO_HISTORY', 'images-old,invalid repo')
    expect(isAllowedPublicMediaUrl('https://raw.githubusercontent.com/owner/images-old/main/uploads/blog/a.png')).toBe(true)
    expect(isAllowedPublicMediaUrl('https://raw.githubusercontent.com/owner/not-listed/main/uploads/blog/a.png')).toBe(false)
  })

  it('converts approved local cover paths to absolute metadata URLs', () => {
    expect(toAbsolutePublicMediaUrl('/images/cover.png', 'https://blog.example.test')).toBe('https://blog.example.test/images/cover.png')
    expect(toAbsolutePublicMediaUrl('https://untrusted.example/cover.png', 'https://blog.example.test')).toBeUndefined()
  })
})
