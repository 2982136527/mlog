import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/utils'

type GlassCardProps = ComponentPropsWithoutRef<'section'>

export function GlassCard({ className, style, ...props }: GlassCardProps) {
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-3xl border p-6 backdrop-blur-xl',
        className
      )}
      style={{
        borderColor: 'var(--glass-border)',
        background: 'var(--glass-bg)',
        boxShadow: 'var(--glass-shadow)',
        ...style
      }}
      {...props}
    />
  )
}
