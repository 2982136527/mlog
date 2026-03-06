import { getAuthSession } from '@/lib/auth'
import { isAdminLogin } from '@/lib/admin/permissions'
import { AdminHttpError } from '@/lib/admin/errors'

export type UserSessionContext = {
  login: string
  isAdmin: boolean
}

export async function requireUserSession(): Promise<UserSessionContext> {
  const session = await getAuthSession()
  const login = session?.user?.login?.trim()

  if (!session?.user || !login) {
    throw new AdminHttpError(401, 'UNAUTHORIZED', 'Authentication required')
  }

  return {
    login,
    isAdmin: isAdminLogin(login)
  }
}

