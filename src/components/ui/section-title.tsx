import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/utils'

type SectionTitleProps = ComponentPropsWithoutRef<'h2'>

export function SectionTitle({ className, ...props }: SectionTitleProps) {
  return (
    <h2
      className={cn(
        'font-title text-[1.35rem] leading-tight tracking-tight text-[var(--color-ink)] sm:text-[1.55rem]',
        className
      )}
      {...props}
    />
  )
}
