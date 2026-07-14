import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale } from '@/i18n/config'
import { getDictionary } from '@/i18n/dictionaries'
import { createLocaleMetadata } from '@/lib/metadata'
import { MonitorContent } from '@/components/monitor/monitor-content'

type MonitorPageProps = {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: MonitorPageProps): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const dict = getDictionary(locale)
 return createLocaleMetadata({
   locale,
    path: '/monitor',
    title: `${dict.nav.monitor} - ${dict.siteName}`
  })
}

export default async function MonitorPage({ params }: MonitorPageProps) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()

  const dict = getDictionary(locale)

  return (
    <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
      <div className="pb-10">
        <div className="mb-6">
          <h1 className="font-title text-4xl text-[var(--color-ink)]">{dict.nav.monitor}</h1>
          <p className="mt-2 text-sm text-[var(--color-ink-soft)]">{dict.monitor.subtitle}</p>
        </div>
        <MonitorContent locale={locale} dict={{
          memory: dict.monitor.memory,
          gpu: dict.monitor.gpu,
          cpu: dict.monitor.cpu,
          noData: dict.monitor.noData,
          days: dict.monitor.days,
          price: dict.monitor.price,
          updated: dict.monitor.updated
        }} />
      </div>
    </div>
  )
}
