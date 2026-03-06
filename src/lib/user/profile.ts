import { AdminHttpError } from '@/lib/admin/errors'
import { ensureUserProfile } from '@/lib/user/db'

export async function requireActiveUserProfile(login: string): Promise<{ login: string; role: 'admin' | 'user' }> {
  const profile = await ensureUserProfile(login)
  if (profile.status !== 'active') {
    throw new AdminHttpError(403, 'FORBIDDEN', 'User account is blocked.')
  }
  return {
    login: profile.login,
    role: profile.role
  }
}

