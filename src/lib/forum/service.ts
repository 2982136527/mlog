import crypto from 'node:crypto'
import { AdminHttpError } from '@/lib/admin/errors'
import type {
  ForumAuthor,
  ForumCategory,
  ForumContentLocale,
  ForumMyReply,
  ForumReply,
  ForumThreadDetail,
  ForumThreadSummary,
  ForumTranslationStatus
} from '@/types/forum'

const GITHUB_GRAPHQL_ENDPOINT = 'https://api.github.com/graphql'
const DEFAULT_FORUM_REPO = '2982136527/mlog'
const FORUM_LABEL_ROOT = 'mlog-forum'
const FORUM_LABEL_LANG_PREFIX = 'mlog-lang-'
const FORUM_LABEL_PAIR_PREFIX = 'mlog-pair-'

type GraphqlError = {
  message?: string
}

type GraphqlResponse<T> = {
  data?: T
  errors?: GraphqlError[]
}

type DiscussionCategoryNode = {
  id: string
  slug: string
  name: string
  description?: string | null
  isAnswerable?: boolean | null
}

type UserNode = {
  login: string
  avatarUrl: string
  url: string
}

type LabelNode = {
  id?: string
  name: string
}

type ReactionNode = {
  users?: {
    totalCount: number
  } | null
}

type CommentNode = {
  id: string
  body: string
  bodyText: string
  createdAt: string
  updatedAt: string
  url: string
  author?: UserNode | null
}

type DiscussionNode = {
  id: string
  number: number
  title: string
  body: string
  bodyText: string
  url: string
  createdAt: string
  updatedAt: string
  author?: UserNode | null
  category?: DiscussionCategoryNode | null
  labels?: {
    nodes?: LabelNode[] | null
  } | null
  comments?: {
    totalCount: number
    nodes?: CommentNode[] | null
    pageInfo?: {
      hasNextPage: boolean
      endCursor?: string | null
    } | null
  } | null
  reactionGroups?: ReactionNode[] | null
}

function resolveForumRepo(): {
  owner: string
  name: string
} {
  const raw = (process.env.FORUM_GITHUB_REPO || process.env.NEXT_PUBLIC_GISCUS_REPO || DEFAULT_FORUM_REPO).trim()
  const matched = raw.match(/^([^/\s]+)\/([^/\s]+)$/)
  if (!matched) {
    throw new AdminHttpError(500, 'FORUM_REPO_NOT_CONFIGURED', 'FORUM_GITHUB_REPO or NEXT_PUBLIC_GISCUS_REPO is invalid.')
  }
  return {
    owner: matched[1],
    name: matched[2]
  }
}

function getReadToken(): string | null {
  const token =
    process.env.CONTENT_GITHUB_READ_TOKEN ||
    process.env.CONTENT_GITHUB_WRITE_TOKEN ||
    process.env.PUBLIC_GITHUB_WRITE_TOKEN ||
    process.env.GITHUB_WRITE_TOKEN ||
    ''

  return token.trim() || null
}

function getSystemWriteToken(): string | null {
  const token = process.env.CONTENT_GITHUB_WRITE_TOKEN || process.env.PUBLIC_GITHUB_WRITE_TOKEN || process.env.GITHUB_WRITE_TOKEN || ''
  return token.trim() || null
}

async function githubGraphql<T>(input: {
  query: string
  variables?: Record<string, unknown>
  accessToken?: string
}): Promise<T> {
  const token = input.accessToken || getReadToken()
  const response = await fetch(GITHUB_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      query: input.query,
      variables: input.variables || {}
    }),
    cache: 'no-store'
  })

  const payload = (await response.json().catch(() => null)) as GraphqlResponse<T> | null
  if (!response.ok) {
    const upstreamMessage = payload?.errors?.[0]?.message || response.statusText || 'GitHub GraphQL request failed.'
    throw new AdminHttpError(502, 'FORUM_UPSTREAM_FAILED', upstreamMessage, {
      status: response.status
    })
  }
  if (!payload?.data) {
    const message = payload?.errors?.[0]?.message || 'GitHub GraphQL data is empty.'
    throw new AdminHttpError(502, 'FORUM_UPSTREAM_FAILED', message)
  }
  if (payload.errors?.length) {
    throw new AdminHttpError(502, 'FORUM_UPSTREAM_FAILED', payload.errors[0]?.message || 'GitHub GraphQL returned errors.')
  }

  return payload.data
}

function mapAuthor(input: UserNode | null | undefined): ForumAuthor | null {
  if (!input?.login) {
    return null
  }
  return {
    login: input.login,
    avatarUrl: input.avatarUrl,
    url: input.url
  }
}

function mapCategory(input: DiscussionCategoryNode | null | undefined): ForumCategory | null {
  if (!input?.id) {
    return null
  }
  return {
    id: input.id,
    slug: input.slug,
    name: input.name,
    description: input.description || null,
    isAnswerable: Boolean(input.isAnswerable)
  }
}

function mapReactionCount(reactionGroups: ReactionNode[] | null | undefined): number {
  if (!reactionGroups?.length) {
    return 0
  }
  return reactionGroups.reduce((sum, item) => sum + (item.users?.totalCount ?? 0), 0)
}

function normalizeContentLocale(value: string | null | undefined): ForumContentLocale {
  return value === 'en' ? 'en' : 'zh'
}

function extractLabelNames(node: DiscussionNode): string[] {
  return (node.labels?.nodes || []).map(item => item.name).filter(Boolean)
}

function parseLocaleFromLabels(labels: string[]): ForumContentLocale {
  const zhLabel = `${FORUM_LABEL_LANG_PREFIX}zh`
  const enLabel = `${FORUM_LABEL_LANG_PREFIX}en`
  if (labels.includes(enLabel)) {
    return 'en'
  }
  if (labels.includes(zhLabel)) {
    return 'zh'
  }
  return 'zh'
}

function parsePairIdFromLabels(labels: string[]): string | null {
  for (const label of labels) {
    if (!label.startsWith(FORUM_LABEL_PAIR_PREFIX)) {
      continue
    }
    const pairId = label.slice(FORUM_LABEL_PAIR_PREFIX.length).trim()
    if (pairId) {
      return pairId
    }
  }
  return null
}

function mapThread(node: DiscussionNode): ForumThreadSummary {
  const labels = extractLabelNames(node)
  const pairId = parsePairIdFromLabels(labels)
  const contentLocale = parseLocaleFromLabels(labels)

  return {
    id: node.id,
    number: node.number,
    title: node.title,
    bodyText: node.bodyText || '',
    url: node.url,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    author: mapAuthor(node.author),
    category: mapCategory(node.category),
    labels,
    contentLocale,
    pairId,
    translationStatus: pairId ? 'bilingual' : 'single',
    counterpart: null,
    commentCount: node.comments?.totalCount ?? 0,
    reactionCount: mapReactionCount(node.reactionGroups)
  }
}

function mapReply(node: CommentNode): ForumReply {
  return {
    id: node.id,
    body: node.body,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    url: node.url,
    author: mapAuthor(node.author)
  }
}

function connectPairCounterparts(items: ForumThreadSummary[]): ForumThreadSummary[] {
  const byPair = new Map<string, ForumThreadSummary[]>()
  for (const item of items) {
    if (!item.pairId) {
      continue
    }
    const group = byPair.get(item.pairId) || []
    group.push(item)
    byPair.set(item.pairId, group)
  }

  for (const item of items) {
    if (!item.pairId) {
      item.translationStatus = 'single'
      item.counterpart = null
      continue
    }

    const siblings = byPair.get(item.pairId) || []
    const preferred = siblings.find(candidate => candidate.number !== item.number && candidate.contentLocale !== item.contentLocale)
    const fallback = siblings.find(candidate => candidate.number !== item.number)
    const counterpart = preferred || fallback || null

    item.translationStatus = 'bilingual'
    item.counterpart = counterpart
      ? {
          number: counterpart.number,
          locale: counterpart.contentLocale
        }
      : null
  }

  return items
}

async function loadRepoContext(accessToken?: string): Promise<{
  repositoryId: string
  categories: ForumCategory[]
  categoriesBySlug: Map<string, ForumCategory>
}> {
  const repo = resolveForumRepo()
  const data = await githubGraphql<{
    repository: {
      id: string
      discussionCategories: {
        nodes: DiscussionCategoryNode[]
      }
    } | null
  }>({
    query: `
      query ForumRepoContext($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          id
          discussionCategories(first: 50) {
            nodes {
              id
              slug
              name
              description
              isAnswerable
            }
          }
        }
      }
    `,
    variables: repo,
    accessToken
  })

  if (!data.repository?.id) {
    throw new AdminHttpError(404, 'FORUM_NOT_FOUND', 'Forum repository was not found.')
  }

  const categories = (data.repository.discussionCategories.nodes || []).map(node => mapCategory(node)).filter((item): item is ForumCategory => Boolean(item))
  const categoriesBySlug = new Map(categories.map(item => [item.slug, item]))

  return {
    repositoryId: data.repository.id,
    categories,
    categoriesBySlug
  }
}

export async function listForumCategories(): Promise<ForumCategory[]> {
  const { categories } = await loadRepoContext()
  return categories
}

async function findCounterpartByPairId(input: {
  pairId: string
  currentNumber: number
}): Promise<{ number: number; locale: ForumContentLocale } | null> {
  const repo = resolveForumRepo()
  const pairLabel = `${FORUM_LABEL_PAIR_PREFIX}${input.pairId}`

  try {
    const searchQuery = `repo:${repo.owner}/${repo.name} label:${pairLabel}`
    const searchData = await githubGraphql<{
      search: {
        nodes: Array<
          | {
              __typename?: 'Discussion'
              number?: number
              labels?: {
                nodes?: LabelNode[] | null
              } | null
            }
          | null
        >
      }
    }>({
      query: `
        query ForumPairSearch($q: String!) {
          search(query: $q, type: DISCUSSION, first: 10) {
            nodes {
              ... on Discussion {
                number
                labels(first: 20) {
                  nodes {
                    name
                  }
                }
              }
            }
          }
        }
      `,
      variables: {
        q: searchQuery
      }
    })

    const match = (searchData.search.nodes || [])
      .map(node => {
        if (!node?.number) {
          return null
        }
        const labels = (node.labels?.nodes || []).map(item => item.name)
        if (!labels.includes(pairLabel)) {
          return null
        }
        return {
          number: node.number,
          locale: parseLocaleFromLabels(labels)
        }
      })
      .find(item => item && item.number !== input.currentNumber)

    if (match) {
      return match
    }
  } catch {
    // fallback query below
  }

  const fallbackData = await githubGraphql<{
    repository: {
      discussions: {
        nodes: DiscussionNode[]
      }
    } | null
  }>({
    query: `
      query ForumPairFallback($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          discussions(first: 120, orderBy: { field: UPDATED_AT, direction: DESC }) {
            nodes {
              number
              labels(first: 20) {
                nodes {
                  name
                }
              }
            }
          }
        }
      }
    `,
    variables: repo
  })

  for (const node of fallbackData.repository?.discussions.nodes || []) {
    if (node.number === input.currentNumber) {
      continue
    }
    const labels = extractLabelNames(node)
    if (!labels.includes(pairLabel)) {
      continue
    }
    return {
      number: node.number,
      locale: parseLocaleFromLabels(labels)
    }
  }

  return null
}

export async function listForumThreads(input: {
  categorySlug?: string
  cursor?: string | null
  q?: string
  pageSize?: number
  contentLocale?: ForumContentLocale
}): Promise<{
  categories: ForumCategory[]
  category: ForumCategory | null
  items: ForumThreadSummary[]
  pageInfo: {
    hasNextPage: boolean
    endCursor: string | null
  }
}> {
  const { categories, categoriesBySlug } = await loadRepoContext()
  const category = input.categorySlug ? categoriesBySlug.get(input.categorySlug) || null : null
  if (input.categorySlug && !category) {
    throw new AdminHttpError(404, 'FORUM_NOT_FOUND', `Forum category "${input.categorySlug}" does not exist.`)
  }

  const repo = resolveForumRepo()
  const first = Math.max(1, Math.min(input.pageSize || 20, 50))
  const data = await githubGraphql<{
    repository: {
      discussions: {
        nodes: DiscussionNode[]
        pageInfo: {
          hasNextPage: boolean
          endCursor: string | null
        }
      }
    } | null
  }>({
    query: `
      query ForumThreads($owner: String!, $name: String!, $first: Int!, $after: String, $categoryId: ID) {
        repository(owner: $owner, name: $name) {
          discussions(first: $first, after: $after, categoryId: $categoryId, orderBy: { field: UPDATED_AT, direction: DESC }) {
            nodes {
              id
              number
              title
              body
              bodyText
              url
              createdAt
              updatedAt
              author {
                login
                avatarUrl
                url
              }
              category {
                id
                slug
                name
                description
                isAnswerable
              }
              labels(first: 20) {
                nodes {
                  name
                }
              }
              comments {
                totalCount
              }
              reactionGroups {
                users {
                  totalCount
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `,
    variables: {
      ...repo,
      first,
      after: input.cursor || null,
      categoryId: category?.id || null
    }
  })

  if (!data.repository) {
    throw new AdminHttpError(404, 'FORUM_NOT_FOUND', 'Forum repository was not found.')
  }

  const keyword = (input.q || '').trim().toLowerCase()
  const localeFilter = normalizeContentLocale(input.contentLocale)

  const mapped = connectPairCounterparts((data.repository.discussions.nodes || []).map(mapThread))
  let items = mapped.filter(item => item.contentLocale === localeFilter)
  if (keyword) {
    items = items.filter(item => item.title.toLowerCase().includes(keyword) || item.bodyText.toLowerCase().includes(keyword))
  }

  return {
    categories,
    category,
    items,
    pageInfo: {
      hasNextPage: Boolean(data.repository.discussions.pageInfo?.hasNextPage),
      endCursor: data.repository.discussions.pageInfo?.endCursor || null
    }
  }
}

export async function getForumThreadDetail(input: {
  number: number
  cursor?: string | null
  pageSize?: number
}): Promise<ForumThreadDetail> {
  const repo = resolveForumRepo()
  const first = Math.max(1, Math.min(input.pageSize || 20, 50))
  const data = await githubGraphql<{
    repository: {
      discussion: DiscussionNode | null
    } | null
  }>({
    query: `
      query ForumThreadDetail($owner: String!, $name: String!, $number: Int!, $first: Int!, $after: String) {
        repository(owner: $owner, name: $name) {
          discussion(number: $number) {
            id
            number
            title
            body
            bodyText
            url
            createdAt
            updatedAt
            author {
              login
              avatarUrl
              url
            }
            category {
              id
              slug
              name
              description
              isAnswerable
            }
            labels(first: 20) {
              nodes {
                name
              }
            }
            comments(first: $first, after: $after) {
              totalCount
              nodes {
                id
                body
                bodyText
                createdAt
                updatedAt
                url
                author {
                  login
                  avatarUrl
                  url
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
            reactionGroups {
              users {
                totalCount
              }
            }
          }
        }
      }
    `,
    variables: {
      ...repo,
      number: input.number,
      first,
      after: input.cursor || null
    }
  })

  const discussion = data.repository?.discussion
  if (!discussion) {
    throw new AdminHttpError(404, 'FORUM_NOT_FOUND', `Thread #${input.number} was not found.`)
  }

  const mapped = mapThread(discussion)

  let counterpart: { number: number; locale: ForumContentLocale } | null = null
  if (mapped.pairId) {
    counterpart = await findCounterpartByPairId({
      pairId: mapped.pairId,
      currentNumber: mapped.number
    })
  }

  const translationStatus: ForumTranslationStatus = counterpart ? 'bilingual' : 'single'

  return {
    thread: {
      ...mapped,
      translationStatus,
      counterpart,
      body: discussion.body || discussion.bodyText || ''
    },
    contentLocale: mapped.contentLocale,
    translationStatus,
    counterpart,
    replies: (discussion.comments?.nodes || []).map(mapReply),
    pageInfo: {
      hasNextPage: Boolean(discussion.comments?.pageInfo?.hasNextPage),
      endCursor: discussion.comments?.pageInfo?.endCursor || null
    }
  }
}

async function ensureForumLabelIds(input: {
  repositoryId: string
  pairId: string | null
  accessToken: string
}): Promise<Map<string, string>> {
  const desired = [
    {
      name: FORUM_LABEL_ROOT,
      color: 'C97B4A',
      description: 'MLog forum thread metadata'
    },
    {
      name: `${FORUM_LABEL_LANG_PREFIX}zh`,
      color: 'A76B45',
      description: 'MLog forum Chinese thread'
    },
    {
      name: `${FORUM_LABEL_LANG_PREFIX}en`,
      color: '8A5A3A',
      description: 'MLog forum English thread'
    }
  ] as Array<{
    name: string
    color: string
    description: string
  }>

  if (input.pairId) {
    desired.push({
      name: `${FORUM_LABEL_PAIR_PREFIX}${input.pairId}`,
      color: '6E4A32',
      description: 'MLog forum bilingual pair binding'
    })
  }

  const repo = resolveForumRepo()
  const labelsData = await githubGraphql<{
    repository: {
      labels: {
        nodes: Array<{
          id: string
          name: string
        }>
      }
    } | null
  }>({
    query: `
      query ForumLabels($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          labels(first: 120, query: "mlog-") {
            nodes {
              id
              name
            }
          }
        }
      }
    `,
    variables: repo,
    accessToken: input.accessToken
  })

  const existing = new Map<string, string>()
  const list = labelsData.repository?.labels?.nodes || []
  for (const item of list) {
    if (item?.id && item?.name) {
      existing.set(item.name, item.id)
    }
  }

  for (const item of desired) {
    if (existing.has(item.name)) {
      continue
    }

    const created = await githubGraphql<{
      createLabel: {
        label: {
          id: string
          name: string
        } | null
      } | null
    }>({
      query: `
        mutation ForumCreateLabel($repositoryId: ID!, $name: String!, $color: String!, $description: String!) {
          createLabel(input: {
            repositoryId: $repositoryId
            name: $name
            color: $color
            description: $description
          }) {
            label {
              id
              name
            }
          }
        }
      `,
      variables: {
        repositoryId: input.repositoryId,
        name: item.name,
        color: item.color,
        description: item.description
      },
      accessToken: input.accessToken
    })

    const label = created.createLabel?.label
    if (!label?.id) {
      throw new AdminHttpError(502, 'FORUM_UPSTREAM_FAILED', `Failed to create label ${item.name}.`)
    }
    existing.set(label.name, label.id)
  }

  const unresolved = desired.find(item => !existing.has(item.name))
  if (unresolved) {
    throw new AdminHttpError(502, 'FORUM_UPSTREAM_FAILED', `Failed to resolve label ${unresolved.name}.`)
  }

  return existing
}

function buildThreadLabelNames(input: {
  locale: ForumContentLocale
  pairId: string | null
}): string[] {
  const names = [FORUM_LABEL_ROOT, `${FORUM_LABEL_LANG_PREFIX}${input.locale}`]
  if (input.pairId) {
    names.push(`${FORUM_LABEL_PAIR_PREFIX}${input.pairId}`)
  }
  return names
}

async function createDiscussion(input: {
  accessToken: string
  repositoryId: string
  categoryId: string
  title: string
  body: string
}): Promise<{
  id: string
  number: number
  url: string
}> {
  const data = await githubGraphql<{
    createDiscussion: {
      discussion: {
        id: string
        number: number
        url: string
      } | null
    } | null
  }>({
    query: `
      mutation CreateForumThread($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
        createDiscussion(input: {
          repositoryId: $repositoryId
          categoryId: $categoryId
          title: $title
          body: $body
        }) {
          discussion {
            id
            number
            url
          }
        }
      }
    `,
    variables: {
      repositoryId: input.repositoryId,
      categoryId: input.categoryId,
      title: input.title.trim(),
      body: input.body.trim()
    },
    accessToken: input.accessToken
  })

  const discussion = data.createDiscussion?.discussion
  if (!discussion) {
    throw new AdminHttpError(502, 'FORUM_UPSTREAM_FAILED', 'Failed to create discussion.')
  }
  return discussion
}

async function addLabelsToDiscussion(input: {
  accessToken: string
  discussionId: string
  labelIds: string[]
}): Promise<void> {
  if (input.labelIds.length === 0) {
    return
  }

  await githubGraphql({
    query: `
      mutation ForumAddLabels($labelableId: ID!, $labelIds: [ID!]!) {
        addLabelsToLabelable(input: {
          labelableId: $labelableId
          labelIds: $labelIds
        }) {
          clientMutationId
        }
      }
    `,
    variables: {
      labelableId: input.discussionId,
      labelIds: input.labelIds
    },
    accessToken: input.accessToken
  })
}

async function deleteDiscussion(input: {
  discussionId: string
  accessToken: string
}): Promise<void> {
  await githubGraphql({
    query: `
      mutation DeleteForumDiscussion($discussionId: ID!) {
        deleteDiscussion(input: {
          id: $discussionId
        }) {
          clientMutationId
        }
      }
    `,
    variables: {
      discussionId: input.discussionId
    },
    accessToken: input.accessToken
  })
}

function createPairId(): string {
  return `${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`
}

export async function createForumThread(input: {
  accessToken: string
  title: string
  body: string
  categorySlug: string
  sourceLocale: ForumContentLocale
  mirror?: {
    title: string
    body: string
    locale: ForumContentLocale
  }
}): Promise<{
  thread: {
    number: number
    id: string
    url: string
    locale: ForumContentLocale
  }
  mirror?: {
    number: number
    id: string
    url: string
    locale: ForumContentLocale
  }
  translationStatus: ForumTranslationStatus
}> {
  const { repositoryId, categoriesBySlug } = await loadRepoContext(input.accessToken)
  const category = categoriesBySlug.get(input.categorySlug)
  if (!category) {
    throw new AdminHttpError(400, 'FORUM_INVALID_INPUT', `Forum category "${input.categorySlug}" does not exist.`)
  }

  const translationStatus: ForumTranslationStatus = input.mirror ? 'bilingual' : 'single'
  const pairId = input.mirror ? createPairId() : null

  const labelToken = getSystemWriteToken() || input.accessToken
  const labelMap = await ensureForumLabelIds({
    repositoryId,
    pairId,
    accessToken: labelToken
  })

  const sourceLabelIds = buildThreadLabelNames({
    locale: normalizeContentLocale(input.sourceLocale),
    pairId
  })
    .map(name => labelMap.get(name))
    .filter((item): item is string => Boolean(item))

  const thread = await createDiscussion({
    accessToken: input.accessToken,
    repositoryId,
    categoryId: category.id,
    title: input.title,
    body: input.body
  })

  try {
    await addLabelsToDiscussion({
      accessToken: labelToken,
      discussionId: thread.id,
      labelIds: sourceLabelIds
    })
  } catch (error) {
    await deleteDiscussion({
      discussionId: thread.id,
      accessToken: labelToken
    }).catch(() => {
      // keep the original label error below
    })
    if (error instanceof AdminHttpError) {
      throw error
    }
    throw new AdminHttpError(502, 'FORUM_UPSTREAM_FAILED', 'Failed to set forum labels for source thread.')
  }

  let mirror:
    | {
        number: number
        id: string
        url: string
        locale: ForumContentLocale
      }
    | undefined

  if (input.mirror) {
    const mirrorLabelIds = buildThreadLabelNames({
      locale: normalizeContentLocale(input.mirror.locale),
      pairId
    })
      .map(name => labelMap.get(name))
      .filter((item): item is string => Boolean(item))

    let createdMirrorId: string | null = null
    try {
      const createdMirror = await createDiscussion({
        accessToken: input.accessToken,
        repositoryId,
        categoryId: category.id,
        title: input.mirror.title,
        body: input.mirror.body
      })
      createdMirrorId = createdMirror.id

      await addLabelsToDiscussion({
        accessToken: labelToken,
        discussionId: createdMirror.id,
        labelIds: mirrorLabelIds
      })

      mirror = {
        ...createdMirror,
        locale: normalizeContentLocale(input.mirror.locale)
      }
    } catch (error) {
      const rollbackToken = getSystemWriteToken() || input.accessToken
      if (createdMirrorId) {
        await deleteDiscussion({
          discussionId: createdMirrorId,
          accessToken: rollbackToken
        }).catch(() => {
          // keep the original error below
        })
      }
      await deleteDiscussion({
        discussionId: thread.id,
        accessToken: rollbackToken
      }).catch(() => {
        // keep the original creation error below
      })

      if (error instanceof AdminHttpError) {
        throw error
      }
      throw new AdminHttpError(502, 'FORUM_UPSTREAM_FAILED', 'Failed to create bilingual mirror thread.')
    }
  }

  return {
    thread: {
      ...thread,
      locale: normalizeContentLocale(input.sourceLocale)
    },
    mirror,
    translationStatus
  }
}

export async function createForumReply(input: {
  accessToken: string
  number: number
  body: string
}): Promise<{
  id: string
  url: string
}> {
  const repo = resolveForumRepo()
  const detail = await githubGraphql<{
    repository: {
      discussion: {
        id: string
      } | null
    } | null
  }>({
    query: `
      query ForumReplyTarget($owner: String!, $name: String!, $number: Int!) {
        repository(owner: $owner, name: $name) {
          discussion(number: $number) {
            id
          }
        }
      }
    `,
    variables: {
      ...repo,
      number: input.number
    },
    accessToken: input.accessToken
  })

  const discussionId = detail.repository?.discussion?.id
  if (!discussionId) {
    throw new AdminHttpError(404, 'FORUM_NOT_FOUND', `Thread #${input.number} was not found.`)
  }

  const created = await githubGraphql<{
    addDiscussionComment: {
      comment: {
        id: string
        url: string
      } | null
    } | null
  }>({
    query: `
      mutation AddForumReply($discussionId: ID!, $body: String!) {
        addDiscussionComment(input: {
          discussionId: $discussionId
          body: $body
        }) {
          comment {
            id
            url
          }
        }
      }
    `,
    variables: {
      discussionId,
      body: input.body.trim()
    },
    accessToken: input.accessToken
  })

  const comment = created.addDiscussionComment?.comment
  if (!comment) {
    throw new AdminHttpError(502, 'FORUM_UPSTREAM_FAILED', `Failed to create reply for thread #${input.number}.`)
  }

  return comment
}

export async function getForumMe(input: {
  login: string
}): Promise<{
  threads: ForumThreadSummary[]
  replies: ForumMyReply[]
}> {
  const repo = resolveForumRepo()
  const data = await githubGraphql<{
    repository: {
      discussions: {
        nodes: DiscussionNode[]
      }
    } | null
  }>({
    query: `
      query ForumMe($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          discussions(first: 40, orderBy: { field: UPDATED_AT, direction: DESC }) {
            nodes {
              id
              number
              title
              bodyText
              url
              createdAt
              updatedAt
              author {
                login
                avatarUrl
                url
              }
              category {
                id
                slug
                name
                description
                isAnswerable
              }
              labels(first: 20) {
                nodes {
                  name
                }
              }
              comments(first: 30) {
                totalCount
                nodes {
                  id
                  body
                  bodyText
                  createdAt
                  updatedAt
                  url
                  author {
                    login
                    avatarUrl
                    url
                  }
                }
              }
              reactionGroups {
                users {
                  totalCount
                }
              }
            }
          }
        }
      }
    `,
    variables: repo
  })

  const normalizedLogin = input.login.trim().toLowerCase()
  const threads = connectPairCounterparts((data.repository?.discussions.nodes || []).map(mapThread)).filter(item => item.author?.login.toLowerCase() === normalizedLogin)

  const replies: ForumMyReply[] = []
  for (const discussion of data.repository?.discussions.nodes || []) {
    for (const comment of discussion.comments?.nodes || []) {
      if (comment.author?.login?.toLowerCase() !== normalizedLogin) {
        continue
      }
      replies.push({
        id: comment.id,
        threadNumber: discussion.number,
        threadTitle: discussion.title,
        bodyText: comment.bodyText,
        createdAt: comment.createdAt,
        url: comment.url
      })
    }
  }

  replies.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))

  return {
    threads,
    replies
  }
}
