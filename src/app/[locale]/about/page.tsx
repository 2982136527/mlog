import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { GlassCard } from '@/components/ui/glass-card'
import { SectionTitle } from '@/components/ui/section-title'
import { TagChip } from '@/components/ui/tag-chip'
import { aboutContentByLocale } from '@/content/about'
import { isLocale } from '@/i18n/config'
import { getDictionary } from '@/i18n/dictionaries'
import { createLocaleMetadata } from '@/lib/metadata'

type AboutPageProps = {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: AboutPageProps): Promise<Metadata> {
  const { locale } = await params

  if (!isLocale(locale)) {
    return {}
  }

  const dict = getDictionary(locale)

  return createLocaleMetadata({
    locale,
    title: dict.about.title,
    description: dict.about.description,
    path: `/${locale}/about`
  })
}

export default async function AboutPage({ params }: AboutPageProps) {
  const { locale } = await params

  if (!isLocale(locale)) {
    notFound()
  }

  const dict = getDictionary(locale)
  const content = aboutContentByLocale[locale]

  return (
    <div className='pb-10'>
      <GlassCard className='mb-5 sm:mb-6'>
        <p className='text-xs font-semibold tracking-[0.16em] text-[var(--color-brand)] uppercase'>{dict.about.eyebrow}</p>
        <h1 className='mt-3 font-title text-4xl leading-tight text-[var(--color-ink)] sm:text-5xl'>{content.heroTitle}</h1>
        <p className='mt-4 max-w-3xl text-base leading-7 text-[var(--color-ink-soft)] sm:text-lg'>{content.heroSubtitle}</p>
      </GlassCard>

      <div className='grid grid-cols-1 gap-5 sm:grid-cols-2'>
        {content.sections.map(section => (
          <GlassCard key={section.id} className='h-full'>
            <SectionTitle>{section.title}</SectionTitle>
            <p className='mt-3 text-sm leading-6 text-[var(--color-ink-soft)]'>{section.intro}</p>
            <ul className='mt-4 space-y-2 text-sm leading-6 text-[var(--color-ink)]'>
              {section.points.map(point => (
                <li key={point} className='rounded-xl border border-white/65 bg-white/45 px-3 py-2'>
                  {point}
                </li>
              ))}
            </ul>
            {section.tags && section.tags.length > 0 ? (
              <div className='mt-4 flex flex-wrap gap-2'>
                {section.tags.map(tag => (
                  <TagChip key={`${section.id}-${tag}`}>{tag}</TagChip>
                ))}
              </div>
            ) : null}
          </GlassCard>
        ))}
      </div>
    </div>
  )
}
