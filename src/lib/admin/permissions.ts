const STRICT_ADMIN_LOGIN = '2982136527'

function normalizeLogins(raw: string): string[] {
  return raw
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
}

function readConfiguredAllowlist(): string[] {
  return normalizeLogins(process.env.ADMIN_GITHUB_ALLOWLIST || '')
}

function assertStrictAdminPolicy(configured: string[]): void {
  if (configured.length === 0) {
    return
  }

  const unique = Array.from(new Set(configured))
  if (unique.length !== 1 || unique[0] !== STRICT_ADMIN_LOGIN) {
    throw new Error(`ADMIN_GITHUB_ALLOWLIST must only contain "${STRICT_ADMIN_LOGIN}" under strict admin policy.`)
  }
}

export function getAdminAllowlist(): string[] {
  const configured = readConfiguredAllowlist()
  assertStrictAdminPolicy(configured)
  return [STRICT_ADMIN_LOGIN]
}

export function isAdminLogin(login: string | null | undefined): boolean {
  assertStrictAdminPolicy(readConfiguredAllowlist())

  if (!login) {
    return false
  }

  const normalized = login.trim().toLowerCase()
  return normalized === STRICT_ADMIN_LOGIN
}
