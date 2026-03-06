import { AdminHttpError } from '@/lib/admin/errors'
import {
  countHistoryItems,
  emptyHistoryPayload,
  mergeHistoryPayload,
  normalizeHistoryPayload
} from '@/lib/user-history/shared'
import type { UserHistoryPayload } from '@/types/user-history'

const GITHUB_API_BASE = 'https://api.github.com'
const GIST_FILENAME = 'mlog-history.json'
const GIST_DESCRIPTION_PREFIX = 'MLog user history'

type GithubGistListItem = {
  id: string
  description: string | null
  files?: Record<
    string,
    {
      filename?: string
    }
  >
}

type GithubGistDetail = {
  id: string
  files?: Record<
    string,
    {
      filename?: string
      content?: string
    }
  >
}

type ReadResult = {
  gistId: string | null
  history: UserHistoryPayload
}

type SyncResult = {
  gistId: string
  history: UserHistoryPayload
  uploadedCount: number
  syncedAt: string
}

function parseJsonSafe(input: string): unknown {
  try {
    return JSON.parse(input)
  } catch {
    return null
  }
}

function buildHeaders(accessToken: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${accessToken}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  }
}

async function githubRequest<T>(input: {
  path: string
  accessToken: string
  init?: RequestInit
}): Promise<T> {
  const response = await fetch(`${GITHUB_API_BASE}${input.path}`, {
    ...input.init,
    headers: {
      ...buildHeaders(input.accessToken),
      ...(input.init?.headers || {})
    },
    cache: 'no-store'
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    const message = body.slice(0, 200) || `GitHub API request failed with status ${response.status}.`
    throw new AdminHttpError(502, 'GITHUB_UPSTREAM_FAILED', message, {
      status: response.status
    })
  }

  return (await response.json()) as T
}

function isTargetHistoryGist(item: GithubGistListItem): boolean {
  const files = item.files || {}
  const hasFile = Object.values(files).some(file => (file.filename || '').trim() === GIST_FILENAME)
  if (!hasFile) {
    return false
  }

  const desc = (item.description || '').toLowerCase()
  return desc.startsWith(GIST_DESCRIPTION_PREFIX.toLowerCase())
}

async function findUserHistoryGistId(accessToken: string): Promise<string | null> {
  const list = await githubRequest<GithubGistListItem[]>({
    path: '/gists?per_page=100',
    accessToken
  })

  const found = list.find(isTargetHistoryGist)
  return found?.id || null
}

async function readGistContent(accessToken: string, gistId: string): Promise<UserHistoryPayload> {
  const detail = await githubRequest<GithubGistDetail>({
    path: `/gists/${gistId}`,
    accessToken
  })
  const files = detail.files || {}
  const historyFile = files[GIST_FILENAME]
  if (!historyFile?.content) {
    return emptyHistoryPayload()
  }
  return normalizeHistoryPayload(parseJsonSafe(historyFile.content))
}

export function hasGistScope(scope: string | null | undefined): boolean {
  if (!scope) {
    return false
  }
  return scope
    .split(/[\s,]+/)
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
    .includes('gist')
}

export async function readUserHistoryFromGist(input: {
  accessToken: string
}): Promise<ReadResult> {
  const gistId = await findUserHistoryGistId(input.accessToken)
  if (!gistId) {
    return {
      gistId: null,
      history: emptyHistoryPayload()
    }
  }

  return {
    gistId,
    history: await readGistContent(input.accessToken, gistId)
  }
}

async function createHistoryGist(input: {
  accessToken: string
  login: string
  content: string
}): Promise<string> {
  const created = await githubRequest<{ id: string }>({
    path: '/gists',
    accessToken: input.accessToken,
    init: {
      method: 'POST',
      body: JSON.stringify({
        description: `${GIST_DESCRIPTION_PREFIX} for @${input.login}`,
        public: false,
        files: {
          [GIST_FILENAME]: {
            content: input.content
          }
        }
      })
    }
  })

  return created.id
}

async function updateHistoryGist(input: {
  accessToken: string
  gistId: string
  content: string
}): Promise<void> {
  await githubRequest({
    path: `/gists/${input.gistId}`,
    accessToken: input.accessToken,
    init: {
      method: 'PATCH',
      body: JSON.stringify({
        files: {
          [GIST_FILENAME]: {
            content: input.content
          }
        }
      })
    }
  })
}

export async function syncUserHistoryToGist(input: {
  login: string
  accessToken: string
  localHistory: UserHistoryPayload
}): Promise<SyncResult> {
  const local = normalizeHistoryPayload(input.localHistory)
  const cloud = await readUserHistoryFromGist({
    accessToken: input.accessToken
  })
  const merged = mergeHistoryPayload(cloud.history, local)
  const content = JSON.stringify(merged, null, 2)

  let gistId = cloud.gistId
  if (!gistId) {
    gistId = await createHistoryGist({
      accessToken: input.accessToken,
      login: input.login,
      content
    })
  } else {
    await updateHistoryGist({
      accessToken: input.accessToken,
      gistId,
      content
    })
  }

  return {
    gistId,
    history: merged,
    uploadedCount: countHistoryItems(local),
    syncedAt: new Date().toISOString()
  }
}
