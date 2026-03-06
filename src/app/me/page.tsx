import { redirect } from 'next/navigation'
import { getAuthSession } from '@/lib/auth'
import { MeDashboard } from '@/components/user/me-dashboard'
import type { Locale } from '@/i18n/config'

type MePageProps = {
  searchParams: Promise<{
    locale?: string
  }>
}

function resolveLocale(input: string | undefined): Locale {
  return input === 'en' ? 'en' : 'zh'
}

export default async function MePage({ searchParams }: MePageProps) {
  const params = await searchParams
  const locale = resolveLocale(params.locale)
  const session = await getAuthSession()
  const login = session?.user?.login?.trim()

  if (!session?.user || !login) {
    const query = new URLSearchParams({
      locale,
      callbackUrl: `/me?locale=${locale}`
    })
    redirect(`/me/login?${query.toString()}`)
  }

  return <MeDashboard login={login} hasGistScope={Boolean(session.user.hasGistScope)} locale={locale} />
}
