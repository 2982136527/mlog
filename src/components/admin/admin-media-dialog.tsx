'use client'

import { useEffect } from 'react'
import { AdminMediaLibrary } from '@/components/admin/admin-media-library'
import type { AdminMediaAsset } from '@/types/media'

type AdminMediaDialogProps = {
  open: boolean
  slug?: string
  onClose: () => void
  onInsert: (asset: AdminMediaAsset, alt: string) => void
  onSetCover: (asset: AdminMediaAsset) => void
}

export function AdminMediaDialog({ open, slug, onClose, onInsert, onSetCover }: AdminMediaDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  if (!open) return null

  return (
    <div
      className='fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-0 sm:items-center sm:p-5'
      role='presentation'
      onMouseDown={event => {
        if (event.currentTarget === event.target) onClose()
      }}>
      <div
        role='dialog'
        aria-modal='true'
        aria-labelledby='admin-media-dialog-title'
        className='max-h-[94dvh] w-full max-w-5xl overflow-y-auto rounded-t-2xl border border-white/70 bg-[#fff8f1] p-4 shadow-2xl sm:rounded-2xl sm:p-5'>
        <div className='mb-4 flex items-center justify-between gap-3'>
          <h2 id='admin-media-dialog-title' className='font-title text-2xl text-[var(--color-ink)]'>媒体库</h2>
          <button type='button' onClick={onClose} aria-label='关闭媒体库' className='flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-white text-xl text-[var(--color-ink-soft)]'>
            &times;
          </button>
        </div>
        <AdminMediaLibrary embedded slug={slug} onInsert={onInsert} onSetCover={onSetCover} />
      </div>
    </div>
  )
}
