import { AdminHttpError } from '@/lib/admin/errors'
import type { ForumAuthor, ForumCategory, ForumMyReply, ForumReply, ForumThreadDetail, ForumThreadSummary } from '@/types/forum'

const GITHUB_GRAPHQL_ENDPOINT = 'https://api.github.com/graphql'
const DEFAULT_FORUM_REPO = '2982136527/mlog'

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

function mapThread(node: DiscussionNode): ForumThreadSummary {
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
    labels: node.labels?.nodes?.map(item => item.name).filter(Boolean) || [],
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

export async function listForumThreads(input: {
  categorySlug?: string
  cursor?: string | null
  q?: string
  pageSize?: number
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
              labels(first: 8) {
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
  let items = (data.repository.discussions.nodes || []).map(mapThread)
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
            labels(first: 8) {
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

  return {
    thread: {
      ...mapThread(discussion),
      body: discussion.body || discussion.bodyText || ''
    },
    replies: (discussion.comments?.nodes || []).map(mapReply),
    pageInfo: {
      hasNextPage: Boolean(discussion.comments?.pageInfo?.hasNextPage),
      endCursor: discussion.comments?.pageInfo?.endCursor || null
    }
  }
}

export async function createForumThread(input: {
  accessToken: string
  title: string
  body: string
  categorySlug: string
}): Promise<{
  number: number
  id: string
  url: string
}> {
  const { repositoryId, categoriesBySlug } = await loadRepoContext(input.accessToken)
  const category = categoriesBySlug.get(input.categorySlug)
  if (!category) {
    throw new AdminHttpError(400, 'FORUM_INVALID_INPUT', `Forum category "${input.categorySlug}" does not exist.`)
  }

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
      repositoryId,
      categoryId: category.id,
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
              labels(first: 8) {
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
  const threads = (data.repository?.discussions.nodes || []).map(mapThread).filter(item => item.author?.login.toLowerCase() === normalizedLogin)

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
