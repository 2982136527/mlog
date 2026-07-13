import { describe, expect, it } from 'vitest'
import { extractGithubRepoFromMarkdown } from '@/lib/blog/repo-cards-config'

describe('extractGithubRepoFromMarkdown', () => {
  it('stops at Markdown link boundaries', () => {
    const markdown = '项目地址：[https://github.com/K-Dense-AI/claude-scientific-skills](https://github.com/K-Dense-AI/claude-scientific-skills)'

    expect(extractGithubRepoFromMarkdown(markdown)).toEqual({
      owner: 'K-Dense-AI',
      repo: 'claude-scientific-skills',
      fullName: 'K-Dense-AI/claude-scientific-skills',
      normalizedUrl: 'https://github.com/K-Dense-AI/claude-scientific-skills'
    })
  })

  it('extracts a plain repository URL without trailing punctuation', () => {
    expect(extractGithubRepoFromMarkdown('See https://github.com/vercel/next.js.')).toMatchObject({
      owner: 'vercel',
      repo: 'next.js'
    })
  })
})
