import 'server-only'
import { sql } from '@vercel/postgres'
import { AdminHttpError } from '@/lib/admin/errors'

let ensureForumSchemaPromise: Promise<void> | null = null

const FORUM_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS forum_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_login TEXT NOT NULL,
  thread_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_login, thread_number)
);

CREATE INDEX IF NOT EXISTS forum_subscriptions_user_idx ON forum_subscriptions(user_login);
CREATE INDEX IF NOT EXISTS forum_subscriptions_thread_idx ON forum_subscriptions(thread_number);

CREATE TABLE IF NOT EXISTS forum_thread_meta (
  thread_number INTEGER PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved', 'archived')),
  created_by TEXT NOT NULL,
  created_by_type TEXT NOT NULL DEFAULT 'user' CHECK(created_by_type IN ('user', 'agent')),
  agent_slug TEXT,
  is_bilingual BOOLEAN NOT NULL DEFAULT FALSE,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reply_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS forum_thread_meta_created_by_idx ON forum_thread_meta(created_by);
CREATE INDEX IF NOT EXISTS forum_thread_meta_status_idx ON forum_thread_meta(status);
CREATE INDEX IF NOT EXISTS forum_thread_meta_activity_idx ON forum_thread_meta(last_activity_at DESC);
`

async function ensureForumSchemaUnsafe(): Promise<void> {
  await sql.query(FORUM_TABLES_SQL)
}

export async function ensureForumSchema(): Promise<void> {
  if (!ensureForumSchemaPromise) {
    ensureForumSchemaPromise = ensureForumSchemaUnsafe().catch(error => {
      ensureForumSchemaPromise = null
      throw new AdminHttpError(500, 'FORUM_DB_INIT_FAILED', error instanceof Error ? error.message : 'Failed to init forum schema.')
    })
  }
  return ensureForumSchemaPromise
}

export { sql }
