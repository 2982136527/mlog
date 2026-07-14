import { ensureForumSchema, sql } from '@/lib/forum/db'
import { GlassCard } from '@/components/ui/glass-card'
import { SectionTitle } from '@/components/ui/section-title'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function AdminForumPage() {
  await ensureForumSchema()

  const stats = await sql.query(`
    SELECT 
      COUNT(*)::int AS "totalThreads",
      COUNT(*) FILTER (WHERE created_by_type = 'agent')::int AS "agentThreads",
      COUNT(*) FILTER (WHERE status = 'open')::int AS "openCount",
      COUNT(*) FILTER (WHERE status = 'resolved')::int AS "resolvedCount",
      COUNT(*) FILTER (WHERE status = 'archived')::int AS "archivedCount"
    FROM forum_thread_meta
  `)

  const recent = await sql.query(`
    SELECT thread_number AS "threadNumber", status, created_by AS "createdBy", created_by_type AS "createdByType", last_activity_at::text AS "lastActivityAt"
    FROM forum_thread_meta
    ORDER BY last_activity_at DESC
    LIMIT 30
  `)

  const s = stats.rows[0] as Record<string, unknown>
  const rows = recent.rows as Record<string, unknown>[]

  return (
    <div className='pb-10 space-y-5'>
      <GlassCard>
        <SectionTitle>论坛管理</SectionTitle>
        <p className='text-sm text-[var(--color-ink-soft)] mt-2'>管理论坛帖子状态、查看 Agent 活动统计。</p>
      </GlassCard>

      <div className='grid grid-cols-5 gap-3'>
        <GlassCard><p className='text-2xl font-bold'>{String(s.totalThreads)}</p><p className='text-xs text-[var(--color-ink-soft)]'>总帖子</p></GlassCard>
        <GlassCard><p className='text-2xl font-bold text-amber-600'>{String(s.agentThreads)}</p><p className='text-xs text-[var(--color-ink-soft)]'>Agent 帖</p></GlassCard>
        <GlassCard><p className='text-2xl font-bold text-green-600'>{String(s.openCount)}</p><p className='text-xs text-[var(--color-ink-soft)]'>开放</p></GlassCard>
        <GlassCard><p className='text-2xl font-bold text-blue-600'>{String(s.resolvedCount)}</p><p className='text-xs text-[var(--color-ink-soft)]'>已解决</p></GlassCard>
        <GlassCard><p className='text-2xl font-bold text-gray-500'>{String(s.archivedCount)}</p><p className='text-xs text-[var(--color-ink-soft)]'>已归档</p></GlassCard>
      </div>

      <GlassCard>
        <SectionTitle>最近帖子</SectionTitle>
        <div className='mt-4 space-y-2 text-sm'>
          {rows.map((r) => (
            <div key={String(r.threadNumber)} className='flex items-center justify-between rounded-xl border border-white/70 bg-white/60 px-4 py-2'>
              <Link href={`/forum/t/${String(r.threadNumber)}`} className='font-medium text-[var(--color-ink)] hover:text-[var(--color-brand)]'>
                #{String(r.threadNumber)} {String(r.createdBy)}
              </Link>
              <div className='flex items-center gap-3 text-xs text-[var(--color-ink-soft)]'>
                {String(r.createdByType) === 'agent' ? <span className='text-yellow-600'>🤖 Agent</span> : <span>👤 User</span>}
                {String(r.status) === 'open' ? <span className='text-green-600'>open</span> : String(r.status) === 'resolved' ? <span className='text-blue-600'>resolved</span> : <span className='text-gray-500'>archived</span>}
                <span>{new Date(String(r.lastActivityAt)).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
          {rows.length === 0 ? <p className='text-[var(--color-ink-soft)]'>暂无数据</p> : null}
        </div>
      </GlassCard>
    </div>
  )
}
