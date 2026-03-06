import { sql } from '@vercel/postgres'
import { AdminHttpError } from '@/lib/admin/errors'
import { isAdminLogin } from '@/lib/admin/permissions'

let ensureSchemaPromise: Promise<void> | null = null

function assertDbConfigured() {
  const hasDbUrl = Boolean((process.env.POSTGRES_URL || process.env.DATABASE_URL || '').trim())
  if (!hasDbUrl) {
    throw new AdminHttpError(500, 'USER_DB_NOT_CONFIGURED', 'DATABASE_URL/POSTGRES_URL is not configured for user features.')
  }
}

async function ensureSchemaUnsafe(): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS user_profiles (
    login TEXT PRIMARY KEY,
    role TEXT NOT NULL DEFAULT 'user',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_profiles_role_check CHECK (role IN ('admin', 'user')),
    CONSTRAINT user_profiles_status_check CHECK (status IN ('active', 'blocked'))
  )`

  await sql`CREATE TABLE IF NOT EXISTS user_ai_providers (
    id TEXT PRIMARY KEY,
    user_login TEXT NOT NULL REFERENCES user_profiles(login) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    base_url TEXT NULL,
    encrypted_key TEXT NOT NULL,
    iv TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    key_version INTEGER NOT NULL,
    key_fingerprint TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`

  await sql`CREATE INDEX IF NOT EXISTS user_ai_providers_user_login_idx ON user_ai_providers(user_login)`

  await sql`CREATE TABLE IF NOT EXISTS user_automation_jobs (
    id TEXT PRIMARY KEY,
    user_login TEXT NOT NULL REFERENCES user_profiles(login) ON DELETE CASCADE,
    provider_id TEXT NOT NULL REFERENCES user_ai_providers(id) ON DELETE RESTRICT,
    topic TEXT NOT NULL,
    cron_expr TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    next_run_at TIMESTAMPTZ NULL,
    last_run_at TIMESTAMPTZ NULL,
    lock_expires_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`

  await sql`CREATE INDEX IF NOT EXISTS user_automation_jobs_due_idx ON user_automation_jobs(enabled, next_run_at)`

  await sql`CREATE TABLE IF NOT EXISTS user_automation_runs (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES user_automation_jobs(id) ON DELETE CASCADE,
    user_login TEXT NOT NULL REFERENCES user_profiles(login) ON DELETE CASCADE,
    status TEXT NOT NULL,
    request_id TEXT NOT NULL,
    slug TEXT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    message TEXT NULL,
    error_code TEXT NULL,
    error_message TEXT NULL,
    publish_pr_url TEXT NULL,
    publish_merged BOOLEAN NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ NULL
  )`

  await sql`CREATE INDEX IF NOT EXISTS user_automation_runs_job_id_idx ON user_automation_runs(job_id, started_at DESC)`

  await sql`CREATE TABLE IF NOT EXISTS user_read_history (
    user_login TEXT NOT NULL REFERENCES user_profiles(login) ON DELETE CASCADE,
    locale TEXT NOT NULL,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    first_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    view_count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_login, locale, slug)
  )`

  await sql`CREATE INDEX IF NOT EXISTS user_read_history_last_viewed_idx ON user_read_history(user_login, last_viewed_at DESC)`

  await sql`CREATE TABLE IF NOT EXISTS user_comment_activity (
    user_login TEXT NOT NULL REFERENCES user_profiles(login) ON DELETE CASCADE,
    locale TEXT NOT NULL,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    first_interacted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_interacted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    interaction_count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_login, locale, slug)
  )`

  await sql`CREATE INDEX IF NOT EXISTS user_comment_activity_last_interacted_idx ON user_comment_activity(user_login, last_interacted_at DESC)`
}

export async function ensureUserAutomationSchema(): Promise<void> {
  assertDbConfigured()
  if (!ensureSchemaPromise) {
    ensureSchemaPromise = ensureSchemaUnsafe().catch(error => {
      ensureSchemaPromise = null
      throw error
    })
  }
  try {
    await ensureSchemaPromise
  } catch (error) {
    throw new AdminHttpError(500, 'USER_DB_SCHEMA_INIT_FAILED', error instanceof Error ? error.message : 'Failed to initialize user automation schema.')
  }
}

export async function ensureUserActivitySchema(): Promise<void> {
  await ensureUserAutomationSchema()
}

export async function ensureUserProfile(login: string): Promise<{ login: string; role: 'admin' | 'user'; status: 'active' | 'blocked' }> {
  await ensureUserAutomationSchema()
  const role: 'admin' | 'user' = isAdminLogin(login) ? 'admin' : 'user'

  try {
    await sql`
      INSERT INTO user_profiles (login, role, status)
      VALUES (${login}, ${role}, 'active')
      ON CONFLICT (login)
      DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()
    `
    const result = await sql<{
      login: string
      role: 'admin' | 'user'
      status: 'active' | 'blocked'
    }>`
      SELECT login, role, status
      FROM user_profiles
      WHERE login = ${login}
      LIMIT 1
    `
    const row = result.rows[0]
    if (!row) {
      throw new Error('profile not found after upsert')
    }
    return row
  } catch (error) {
    throw new AdminHttpError(500, 'USER_PROFILE_LOAD_FAILED', error instanceof Error ? error.message : 'Failed to load user profile.')
  }
}

export { sql }
