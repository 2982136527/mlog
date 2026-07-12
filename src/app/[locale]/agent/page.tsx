import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { GlassCard } from '@/components/ui/glass-card'
import { SectionTitle } from '@/components/ui/section-title'
import { isLocale } from '@/i18n/config'
import { getDictionary } from '@/i18n/dictionaries'
import { createLocaleMetadata } from '@/lib/metadata'
import { agentContentByLocale } from '@/content/agent'

type AgentPageProps = {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: AgentPageProps): Promise<Metadata> {
  const { locale } = await params

  if (!isLocale(locale)) {
    return {}
  }

  const dict = getDictionary(locale)

  return createLocaleMetadata({
    locale,
    title: `AI Agent - ${dict.siteName}`,
    description: 'MLog AI Agent API — 让 AI 自动撰写和发布双语博客文章。',
    path: `/${locale}/agent`
  })
}

export default async function AgentPage({ params }: AgentPageProps) {
  const { locale } = await params

  if (!isLocale(locale)) {
    notFound()
  }

  const content = agentContentByLocale[locale]

  return (
    <div className='pb-10'>
      <GlassCard className='mb-5 sm:mb-6'>
        <h1 className='font-title text-4xl leading-tight text-[var(--color-ink)] sm:text-5xl'>{content.heroTitle}</h1>
        <p className='mt-4 max-w-3xl text-base leading-7 text-[var(--color-ink-soft)] sm:text-lg'>
          {content.heroSubtitle}
        </p>
      </GlassCard>

      <GlassCard className='mb-5 sm:mb-6'>
        <SectionTitle>{content.getStartedTitle}</SectionTitle>
        <ol className='mt-4 space-y-2'>
          {content.getStartedSteps.map((step, i) => (
            <li key={i} className='flex items-start gap-3 rounded-xl border border-white/65 bg-white/45 px-4 py-3 text-sm leading-6 text-[var(--color-ink)]'>
              <span className='mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand)] text-xs font-bold text-white'>
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </GlassCard>

      <div className='grid grid-cols-1 gap-5'>
        {content.prompts.map((prompt, idx) => (
          <GlassCard key={idx}>
            <div className='flex flex-wrap items-start justify-between gap-3'>
              <div className='flex-1'>
                <SectionTitle>{prompt.title}</SectionTitle>
                <p className='mt-1 text-sm leading-6 text-[var(--color-ink-soft)]'>{prompt.description}</p>
              </div>
              <div className='flex flex-wrap gap-2'>
                {prompt.highlights.map(h => (
                  <span
                    key={h}
                    className='rounded-full border border-[var(--color-border-strong)] bg-white/60 px-2.5 py-1 text-xs font-medium text-[var(--color-ink-soft)]'
                  >
                    {h}
                  </span>
                ))}
              </div>
            </div>

            <details className='group mt-4'>
              <summary className='cursor-pointer rounded-lg bg-white/40 px-3 py-2 text-sm font-medium text-[var(--color-brand)] transition hover:bg-white/60'>
                {locale === 'zh' ? '查看提示词全文 →' : 'View full prompt →'}
              </summary>
              <div className='mt-3 overflow-x-auto rounded-xl border border-[var(--color-border-strong)] bg-white/60 p-4'>
                <pre className='whitespace-pre-wrap text-sm leading-6 text-[var(--color-ink)] font-mono'>{prompt.prompt}</pre>
              </div>
            </details>
          </GlassCard>
        ))}
      </div>
    </div>
  )
}
