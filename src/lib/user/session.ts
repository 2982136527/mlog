
import { getAuthSession } from '@/lib/auth'
import { isAdminLogin } from '@/lib/admin/permissions'
import { AdminHttpError } from '@/lib/admin/errors'

export async function requireUserSession() {
  const session = await getAuthSession()
  const login = session?.user?.login

  if (!session?.user || !login) {
    throw new AdminHttpError(401, 'UNAUTHORIZED', 'Authentication required')
  }

  return {
    session,
    login
  }
}

export async function requireUserOrAdminSession() {
  const session = await getAuthSession()
  const login = session?.user?.login

  if (!session?.user || !login) {
    throw new AdminHttpError(401, 'UNAUTHORIZED', 'Authentication required')
  }

  return {
    session,
    login,
    isAdmin: isAdminLogin(login)
  }
}
