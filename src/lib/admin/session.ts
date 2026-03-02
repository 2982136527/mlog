import { getAuthSession } from '@/lib/auth'
import { isAdminLogin } from '@/lib/admin/permissions'
import { AdminHttpError } from '@/lib/admin/errors'

export async function requireAdminSession() {
  const session = await getAuthSession()
  const login = session?.user?.login

  if (!session?.user) {
    throw new AdminHttpError(401, 'UNAUTHORIZED', 'Authentication required')
  }

  if (!isAdminLogin(login)) {
    throw new AdminHttpError(403, 'FORBIDDEN', 'Admin access denied')
  }

  return {
    session,
    login: login!
  }
}
