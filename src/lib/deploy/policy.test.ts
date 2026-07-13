import { describe, expect, it } from 'vitest'
import { requiresVercelDeployment } from '@/lib/deploy/policy'

describe('requiresVercelDeployment', () => {
  it('skips builds for article content and repo-card changes', () => {
    expect(requiresVercelDeployment([
      'content/posts/new-post/zh.md',
      'content/posts/new-post/en.md',
      'content/posts/new-post/repo-cards.json'
    ])).toBe(false)
  })

  it('requires a build for static uploads', () => {
    expect(requiresVercelDeployment([
      'public/images/uploads/2026/07/cover.png'
    ])).toBe(true)
  })

  it('requires one build when static uploads and article content change together', () => {
    expect(requiresVercelDeployment([
      'content/posts/new-post/zh.md',
      'public/images/uploads/2026/07/cover.png'
    ])).toBe(true)
  })

  it('does not match empty input or similar non-upload prefixes', () => {
    expect(requiresVercelDeployment([])).toBe(false)
    expect(requiresVercelDeployment(['public/images/uploads-old/image.png'])).toBe(false)
  })
})
