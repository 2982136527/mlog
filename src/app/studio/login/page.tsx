import { redirect } from 'next/navigation'

type LoginPageProps = {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>
}

export default async function StudioLoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const query = new URLSearchParams()
  query.set('callbackUrl', params.callbackUrl || '/me')
  if (params.error) {
    query.set('error', params.error)
  }
  redirect(`/me/login?${query.toString()}`)
}
