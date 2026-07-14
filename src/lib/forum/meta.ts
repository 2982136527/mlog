import 'server-only'
import { ensureForumSchema, sql } from '@/lib/forum/db'

export type ForumPostMeta = {
  threadNumber: number
  status: 'open' | 'resolved' | 'archived'
  createdBy: string
  createdByType: 'user' | 'agent'
  agentSlug: string | null
  lastActivityAt: string
  replyCount: number
}

function parseRow(row: Record<string, unknown>): ForumPostMeta {
  return {
    threadNumber: Number(row.threadNumber),
    status: String(row.status) as 'open' | 'resolved' | 'archived',
    createdBy: String(row.createdBy),
    createdByType: String(row.createdByType) as 'user' | 'agent',
    agentSlug: row.agentSlug ? String(row.agentSlug) : null,
    lastActivityAt: String(row.lastActivityAt),
    replyCount: Number(row.replyCount)
  }
}

export async function getForumMetaByNumbers(threadNumbers: number[]): Promise<Map<number, ForumPostMeta>> {
  if (threadNumbers.length === 0) return new Map()
  await ensureForumSchema()

  const ids = threadNumbers.join(',')
  const result = await sql.query(
    `SELECT 
      thread_number AS "threadNumber",
      status,
      created_by AS "createdBy",
      created_by_type AS "createdByType",
      agent_slug AS "agentSlug",
      last_activity_at::text AS "lastActivityAt",
      reply_count AS "replyCount"
    FROM forum_thread_meta
    WHERE thread_number = ANY(${ids}::int[])`
  )

  const map = new Map<number, ForumPostMeta>()
  for (const row of result.rows) {
    const meta = parseRow(row)
    map.set(meta.threadNumber, meta)
  }
  return map
}
