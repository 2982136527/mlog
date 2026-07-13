import { afterEach, describe, expect, it, vi } from 'vitest'
import { matchRemotePattern } from 'next/dist/shared/lib/match-remote-pattern'
import { mediaRemotePatterns } from './next.config'

afterEach(() => vi.unstubAllEnvs())

describe('Next media remote patterns', () => {
  it('allows provider URLs for an encoded slash branch and rejects a different repository', () => {
    vi.stubEnv('IMAGE_GITHUB_OWNER', 'owner')
    vi.stubEnv('IMAGE_GITHUB_REPO', 'images')
    vi.stubEnv('IMAGE_GITHUB_BRANCH', 'media/main')
    const patterns = mediaRemotePatterns()

    expect(patterns.some(pattern => matchRemotePattern(
      pattern,
      new URL('https://raw.githubusercontent.com/owner/images/media%2Fmain/uploads/blog/a.png')
    ))).toBe(true)
    expect(patterns.some(pattern => matchRemotePattern(
      pattern,
      new URL('https://cdn.jsdelivr.net/gh/owner/images@media%2Fmain/uploads/blog/a.png')
    ))).toBe(true)
    expect(patterns.some(pattern => matchRemotePattern(
      pattern,
      new URL('https://raw.githubusercontent.com/other/images/media%2Fmain/uploads/blog/a.png')
    ))).toBe(false)
  })
})
