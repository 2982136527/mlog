import { ensureUserActivitySchema, sql } from '@/lib/user/db'
import { requireActiveUserProfile } from '@/lib/user/profile'
import type { UserCommentActivityItem, UserReadHistoryItem } from '@/types/user-activity'

type ActivityInput = {
  login: string
  locale: 'zh' | 'en'
  slug: string
  title: string
}

const DEFAULT_LIMIT = 30

function normalizeLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) {
    return DEFAULT_LIMIT
  }
  return Math.max(1, Math.min(100, Math.floor(limit)))
}

export async function recordReadActivity(input: ActivityInput): Promise<void> {
  await ensureUserActivitySchema()
  await requireActiveUserProfile(input.login)

  await sql`
    INSERT INTO user_read_history (
      user_login, locale, slug, title, first_viewed_at, last_viewed_at, view_count
    )
    VALUES (
      ${input.login}, ${input.locale}, ${input.slug}, ${input.title}, NOW(), NOW(), 1
    )
    ON CONFLICT (user_login, locale, slug)
    DO UPDATE SET
      title = EXCLUDED.title,
      last_viewed_at = NOW(),
      view_count = user_read_history.view_count + 1
  `
}

export async function recordCommentActivity(input: ActivityInput): Promise<void> {
  await ensureUserActivitySchema()
  await requireActiveUserProfile(input.login)

  await sql`
    INSERT INTO user_comment_activity (
      user_login, locale, slug, title, first_interacted_at, last_interacted_at, interaction_count
    )
    VALUES (
      ${input.login}, ${input.locale}, ${input.slug}, ${input.title}, NOW(), NOW(), 1
    )
    ON CONFLICT (user_login, locale, slug)
    DO UPDATE SET
      title = EXCLUDED.title,
      last_interacted_at = NOW(),
      interaction_count = user_comment_activity.interaction_count + 1
  `
}

export async function listReadHistory(login: string, limit?: number): Promise<UserReadHistoryItem[]> {
  await ensureUserActivitySchema()
  await requireActiveUserProfile(login)

  const rowLimit = normalizeLimit(limit)
  const result = await sql<{
    locale: 'zh' | 'en'
    slug: string
    title: string
    first_viewed_at: string
    last_viewed_at: string
    view_count: number
  }>`
    SELECT locale, slug, title, first_viewed_at, last_viewed_at, view_count
    FROM user_read_history
    WHERE user_login = ${login}
    ORDER BY last_viewed_at DESC
    LIMIT ${rowLimit}
  `

  return result.rows.map(row => ({
    locale: row.locale,
    slug: row.slug,
    title: row.title,
    firstViewedAt: row.first_viewed_at,
    lastViewedAt: row.last_viewed_at,
    viewCount: row.view_count
  }))
}

export async function listCommentActivity(login: string, limit?: number): Promise<UserCommentActivityItem[]> {
  await ensureUserActivitySchema()
  await requireActiveUserProfile(login)

  const rowLimit = normalizeLimit(limit)
  const result = await sql<{
    locale: 'zh' | 'en'
    slug: string
    title: string
    first_interacted_at: string
    last_interacted_at: string
    interaction_count: number
  }>`
    SELECT locale, slug, title, first_interacted_at, last_interacted_at, interaction_count
    FROM user_comment_activity
    WHERE user_login = ${login}
    ORDER BY last_interacted_at DESC
    LIMIT ${rowLimit}
  `

  return result.rows.map(row => ({
    locale: row.locale,
    slug: row.slug,
    title: row.title,
    firstInteractedAt: row.first_interacted_at,
    lastInteractedAt: row.last_interacted_at,
    interactionCount: row.interaction_count
  }))
}
