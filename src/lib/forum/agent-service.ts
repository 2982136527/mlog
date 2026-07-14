import 'server-only'
import type { ForumThreadSummary, ForumContentLocale } from '@/types/forum'
import { AdminHttpError } from '@/lib/admin/errors'
import { ensureForumSchema, sql } from '@/lib/forum/db'
import type { ForumCategory } from '@/types/forum'
import {
  createForumThread,
  createForumReply,
  listForumThreads,
  getForumThreadDetail
} from '@/lib/forum/service'

export type AgentForumCreateThreadResult = {
  thread: { number: number; id: string; url: string; locale: ForumContentLocale }
  mirror?: { number: number; id: string; url: string; locale: ForumContentLocale }
  translationStatus: string
}

export type AgentForumReplyResult = {
  id: string
  url: string
}

export type AgentForumUpdate = {
  threadNumber: number
  threadTitle: string
  lastReplyAt: string
  lastReplyAuthor: string
  replyCount: number
  isRead: boolean
}

export type AgentForumPost = {
  number: number
  title: string
  bodyText: string
  createdAt: string
  updatedAt: string
  replyCount: number
  lastActivityAt: string | null
}

function getSystemAccessToken(): string {
  const token = (
    process.env.CONTENT_GITHUB_WRITE_TOKEN || 
    process.env.PUBLIC_GITHUB_WRITE_TOKEN || 
    ''
  ).trim()
  if (!token) {
    throw new AdminHttpError(500, 'FORUM_TOKEN_MISSING', 'System GitHub token is not configured for forum agent API.')
  }
  return token
}

export async function agentCreateThread(input: {
  title: string
  body: string
  categorySlug?: string
  locale: ForumContentLocale
  login: string
  agentSlug?: string
}): Promise<AgentForumCreateThreadResult> {
  const systemToken = getSystemAccessToken()
  await ensureForumSchema()

  const result = await createForumThread({
    accessToken: systemToken,
    title: input.title,
    body: input.body,
    categorySlug: input.categorySlug || 'general',
    sourceLocale: input.locale,
  })

  // Register in forum_thread_meta
  const threadNumber = result.thread.number
  await sql`
    INSERT INTO forum_thread_meta (thread_number, status, created_by, created_by_type, agent_slug, is_bilingual, last_activity_at, reply_count)
    VALUES (${threadNumber}, 'open', ${input.login}, 'agent', ${input.agentSlug || null}, ${result.translationStatus === 'bilingual'}, NOW(), 0)
    ON CONFLICT (thread_number) DO UPDATE
    SET created_by = EXCLUDED.created_by, created_by_type = 'agent', agent_slug = EXCLUDED.agent_slug
  `

  // Auto-subscribe the agent to its own thread
  await sql`
    INSERT INTO forum_subscriptions (user_login, thread_number, last_read_at)
    VALUES (${input.login}, ${threadNumber}, NOW())
    ON CONFLICT (user_login, thread_number) DO UPDATE SET last_read_at = NOW()
  `.catch(() => {})

  return result
}

export async function agentReplyToThread(input: {
  threadNumber: number
  body: string
  login: string
}): Promise<AgentForumReplyResult> {
  const systemToken = getSystemAccessToken()
  await ensureForumSchema()

  const result = await createForumReply({
    accessToken: systemToken,
    number: input.threadNumber,
    body: input.body
  })

  // Update thread meta
  await sql`
    INSERT INTO forum_thread_meta (thread_number, status, created_by, created_by_type, last_activity_at, reply_count)
    VALUES (${input.threadNumber}, 'open', ${input.login}, 'agent', NOW(), 1)
    ON CONFLICT (thread_number) DO UPDATE
    SET last_activity_at = NOW(),
        reply_count = forum_thread_meta.reply_count + 1
  `

  return result
}

export async function agentGetMyThreads(input: {
  login: string
  page?: number
  pageSize?: number
}): Promise<{ threads: AgentForumPost[]; total: number }> {
  await ensureForumSchema()

  const page = Math.max(1, input.page || 1)
  const pageSize = Math.min(50, Math.max(1, input.pageSize || 20))
  const offset = (page - 1) * pageSize

  const result = await sql<Record<string, unknown>>`
    SELECT 
      m.thread_number AS number,
      m.last_activity_at,
      m.reply_count,
      COUNT(*) OVER() AS total
    FROM forum_thread_meta m
    WHERE m.created_by = ${input.login} AND m.created_by_type = 'agent'
    ORDER BY m.last_activity_at DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `

  // Fetch thread titles from GitHub for each thread (up to 50 at a time is OK)
  const threads: AgentForumPost[] = []
  for (const row of result.rows) {
    try {
      const number = Number(row.number)
      const detail = await getForumThreadDetail({ number })
      threads.push({
        number: number,
        title: detail.thread.title,
        bodyText: detail.thread.bodyText,
        createdAt: detail.thread.createdAt,
        updatedAt: detail.thread.updatedAt,
        replyCount: Number(row.reply_count || 0),
        lastActivityAt: String(row.last_activity_at || '')
      })
    } catch {
      // Thread might have been deleted
    }
  }

  return {
    threads,
    total: Number(result.rows[0]?.total || 0)
  }
}

export async function agentGetUpdates(input: {
  login: string
  since?: string
}): Promise<AgentForumUpdate[]> {
  await ensureForumSchema()

  let q = 'SELECT m.thread_number, m.last_activity_at::text, s.last_read_at::text, m.reply_count ' +
    'FROM forum_subscriptions s ' +
    'JOIN forum_thread_meta m ON m.thread_number = s.thread_number ' +
    'WHERE s.user_login = $1'
  
  const params: (string | number)[] = [input.login]
  
  if (input.since) {
    params.push(input.since)
    q += ' AND m.last_activity_at > $2'
  }

  q += ' ORDER BY m.last_activity_at DESC LIMIT 50'

  const result = await sql.query(q, params)

  const updates: AgentForumUpdate[] = []
  for (const row of result.rows) {
    try {
      const detail = await getForumThreadDetail({ number: Number(row.thread_number) })
      const lastReply = detail.replies[detail.replies.length - 1]
      const isRead = new Date(String(row.last_read_at)) >= new Date(String(row.last_activity_at))

      updates.push({
        threadNumber: Number(row.thread_number),
        threadTitle: detail.thread.title,
        lastReplyAt: lastReply?.createdAt || String(row.last_activity_at),
        lastReplyAuthor: lastReply?.author?.login || 'unknown',
        replyCount: Number(row.reply_count),
        isRead
      })
    } catch {
      // Thread deleted or inaccessible
    }
  }

  return updates
}

export async function agentSubscribe(input: {
  login: string
  threadNumber: number
  action: 'subscribe' | 'unsubscribe'
}): Promise<{ subscribed: boolean }> {
  await ensureForumSchema()

  if (input.action === 'subscribe') {
    await sql`
      INSERT INTO forum_subscriptions (user_login, thread_number, last_read_at)
      VALUES (${input.login}, ${input.threadNumber}, NOW())
      ON CONFLICT (user_login, thread_number) DO UPDATE SET last_read_at = NOW()
    `
    return { subscribed: true }
  } else {
    await sql`
      DELETE FROM forum_subscriptions
      WHERE user_login = ${input.login} AND thread_number = ${input.threadNumber}
    `
    return { subscribed: false }
  }
}

export async function agentMarkRead(input: {
  login: string
  threadNumber: number
}): Promise<void> {
  await ensureForumSchema()
  await sql`
    UPDATE forum_subscriptions
    SET last_read_at = NOW()
    WHERE user_login = ${input.login} AND thread_number = ${input.threadNumber}
  `
}

export async function agentExplore(input: {
  categorySlug?: string
  q?: string
  pageSize?: number
  cursor?: string | null
}): Promise<{
  threads: ForumThreadSummary[]
  categories: ForumCategory[]
  hasNextPage: boolean
  endCursor: string | null
}> {
  const result = await listForumThreads({
    categorySlug: input.categorySlug,
    q: input.q,
    pageSize: input.pageSize || 20,
    cursor: input.cursor
  })

  return {
    threads: result.items,
    categories: result.categories,
    hasNextPage: result.pageInfo.hasNextPage,
    endCursor: result.pageInfo.endCursor
  }
}
