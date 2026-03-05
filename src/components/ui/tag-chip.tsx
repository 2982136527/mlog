import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/utils'

type TagChipProps = ComponentPropsWithoutRef<'span'>

export function TagChip({ className, style, ...props }: TagChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium',
        className
      )}
      style={{
        borderColor: 'var(--chip-border)',
        background: 'var(--chip-bg)',
        color: 'var(--chip-text)',
        boxShadow: 'var(--chip-shadow)',
        ...style
      }}
      {...props}
    />
  )
}
