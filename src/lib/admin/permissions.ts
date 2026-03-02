export function getAdminAllowlist(): string[] {
  return (process.env.ADMIN_GITHUB_ALLOWLIST || '')
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdminLogin(login: string | null | undefined): boolean {
  if (!login) {
    return false
  }

  const allowlist = getAdminAllowlist()
  if (allowlist.length === 0) {
    return false
  }

  return allowlist.includes(login.toLowerCase())
}
