import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({
  unstable_cache: (loader: () => unknown) => loader
}))

import { getRemoteContentSnapshot } from '@/lib/content/remote-snapshot'

const originalEnv = {
  phase: process.env.NEXT_PHASE,
  owner: process.env.CONTENT_GITHUB_OWNER,
  repo: process.env.CONTENT_GITHUB_REPO,
  readToken: process.env.CONTENT_GITHUB_READ_TOKEN,
  writeToken: process.env.CONTENT_GITHUB_WRITE_TOKEN
}

describe('runtime content configuration', () => {
  beforeEach(() => {
    delete process.env.NEXT_PHASE
    delete process.env.CONTENT_GITHUB_OWNER
    delete process.env.CONTENT_GITHUB_REPO
    delete process.env.CONTENT_GITHUB_READ_TOKEN
    delete process.env.CONTENT_GITHUB_WRITE_TOKEN
  })

  afterEach(() => {
    vi.restoreAllMocks()
    for (const [key, value] of Object.entries({
      NEXT_PHASE: originalEnv.phase,
      CONTENT_GITHUB_OWNER: originalEnv.owner,
      CONTENT_GITHUB_REPO: originalEnv.repo,
      CONTENT_GITHUB_READ_TOKEN: originalEnv.readToken,
      CONTENT_GITHUB_WRITE_TOKEN: originalEnv.writeToken
    })) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('allows an explicit local-content mode when no remote settings exist', async () => {
    await expect(getRemoteContentSnapshot()).resolves.toBeNull()
  })

  it('fails closed when runtime remote settings are incomplete', async () => {
    process.env.CONTENT_GITHUB_OWNER = 'owner'
    process.env.CONTENT_GITHUB_REPO = 'content'

    await expect(getRemoteContentSnapshot()).rejects.toThrow('Incomplete runtime content configuration')
  })

  it('resolves the branch once and downloads an immutable commit archive', async () => {
    const sha = 'a'.repeat(40)
    process.env.CONTENT_GITHUB_OWNER = 'owner'
    process.env.CONTENT_GITHUB_REPO = 'content'
    process.env.CONTENT_GITHUB_READ_TOKEN = 'test-token'
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ object: { sha } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(Buffer.from('not-a-gzip-archive'), { status: 200 }))

    await expect(getRemoteContentSnapshot()).rejects.toThrow()

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/git/ref/heads/main')
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(`/tarball/${sha}`)
  })
})
