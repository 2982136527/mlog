'use client'

import { useState } from 'react'
import type { TutorialSyncResult } from '@/types/tutorial'

type SyncResponse = {
  requestId: string
  result: TutorialSyncResult
  error?: { message?: string }
}

export function AdminTutorialSyncCard() {
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [result, setResult] = useState<{ requestId: string; data: TutorialSyncResult } | null>(null)

  const runSync = async () => {
    setRunning(true)
    setMessage(null)
    setResult(null)

    try {
      const response = await fetch('/api/admin/tutorials/mlog-open-source/sync', {
        method: 'POST'
      })
      const data = (await response.json()) as SyncResponse
      if (!response.ok) {
        throw new Error(data.error?.message || '教程同步失败')
      }

      setResult({
        requestId: data.requestId,
        data: data.result
      })

      if (data.result.status === 'SKIPPED_NO_SOURCE_CHANGE') {
        setMessage(`无需镜像更新（requestId: ${data.requestId}）`)
      } else if (data.result.deploy?.success) {
        setMessage(`教程已同步并触发部署（requestId: ${data.requestId}）`)
      } else {
        setMessage(`教程已同步并刷新日期（requestId: ${data.requestId}，部署触发未成功）`)
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '教程同步失败')
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className='space-y-4 rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur'>
      <div>
        <h3 className='font-title text-2xl text-[var(--color-ink)]'>教程公开镜像</h3>
        <p className='mt-1 text-sm text-[var(--color-ink-soft)]'>
          白名单仅同步 <code>{'mlog-open-source-deploy-guide'}</code> 到公开仓 <code>docs/tutorials/</code>，其他文章不会公开。
        </p>
      </div>

      <button
        type='button'
        onClick={runSync}
        disabled={running}
        className='rounded-xl bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-strong)] disabled:cursor-not-allowed disabled:opacity-60'>
        {running ? '同步中...' : '立即同步教程'}
      </button>

      {message && <p className='rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink-soft)]'>{message}</p>}

      {result && (
        <div className='rounded-xl border border-[var(--color-border-strong)] bg-white/80 px-3 py-3 text-xs text-[var(--color-ink-soft)]'>
          <p>requestId：{result.requestId}</p>
          <p>状态：{result.data.status}</p>
          <p>sourceHash：{result.data.sourceHash}</p>
          <p>应用日期：{result.data.updatedDateApplied || '-'}</p>
          <p>日期刷新：{result.data.updatedDateChanged ? '是' : '否'}</p>
          <p>
            部署触发：
            {result.data.deploy
              ? result.data.deploy.success
                ? ' 已触发'
                : ` 未成功（${result.data.deploy.message || '未知原因'}）`
              : ' -'}
          </p>
          <p>
            公开 PR：{result.data.publicMirrorPublish?.prUrl ? (
              <a href={result.data.publicMirrorPublish.prUrl} target='_blank' rel='noreferrer' className='text-[var(--color-brand)] underline'>
                {result.data.publicMirrorPublish.prUrl}
              </a>
            ) : (
              '-'
            )}
          </p>
        </div>
      )}
    </section>
  )
}
