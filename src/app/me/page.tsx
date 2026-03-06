import { redirect } from 'next/navigation'
import { getAuthSession } from '@/lib/auth'
import { MeDashboard } from '@/components/user/me-dashboard'

export default async function MePage() {
  const session = await getAuthSession()
  const login = session?.user?.login?.trim()

  if (!session?.user || !login) {
    redirect('/me/login?callbackUrl=/me')
  }

  return <MeDashboard login={login} hasGistScope={Boolean(session.user.hasGistScope)} />
}
