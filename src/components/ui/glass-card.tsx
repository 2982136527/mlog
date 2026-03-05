import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/utils'

type GlassCardProps = ComponentPropsWithoutRef<'section'>

export function GlassCard({ className, style, children, ...props }: GlassCardProps) {
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
      {...props}>
      <div aria-hidden className='pointer-events-none absolute inset-0' style={{ background: 'var(--card-gloss)' }} />
      <div aria-hidden className='pointer-events-none absolute inset-0 rounded-3xl border' style={{ borderColor: 'var(--card-edge)', boxShadow: 'var(--card-depth-overlay)' }} />
      <div className='relative z-[1]'>{children}</div>
    </section>
  )
}
