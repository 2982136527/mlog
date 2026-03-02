import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/utils'

type TagChipProps = ComponentPropsWithoutRef<'span'>

export function TagChip({ className, ...props }: TagChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-[var(--color-border-strong)] bg-white/70 px-3 py-1 text-xs font-medium text-[var(--color-ink-soft)]',
        className
      )}
      {...props}
    />
  )
}
