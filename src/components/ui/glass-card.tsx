import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/utils'

type GlassCardProps = ComponentPropsWithoutRef<'section'>

export function GlassCard({ className, ...props }: GlassCardProps) {
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-3xl border border-white/55 bg-white/45 p-6 backdrop-blur-xl',
        'shadow-[0_24px_80px_-40px_rgba(120,45,20,0.55),inset_0_1px_0_0_rgba(255,255,255,0.65)]',
        className
      )}
      {...props}
    />
  )
}
