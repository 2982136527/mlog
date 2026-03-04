import { AdminHttpError } from '@/lib/admin/errors'

const DEFAULT_ALLOWED_DOMAINS = new Set(['github.com', 'www.github.com', 'vercel.com', 'www.vercel.com'])
const URL_RE = /https?:\/\/[^\s)]+/gi
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const BLOG_HOST_RE = /\bblog\.[a-z0-9.-]+\.[a-z]{2,}\b/gi

function parseBlocklist(): string[] {
  return Array.from(
    new Set(
      (process.env.PRIVACY_BLOCKLIST || '')
        .split(',')
        .map(item => item.trim().toLowerCase())
        .filter(Boolean)
    )
  )
}

function normalizeText(input: string): string {
  return input.toLowerCase()
}

function getHostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

export function applyPrivacyGuard(input: { text: string; label: string }): { sanitized: string; replaced: number } {
  const normalized = normalizeText(input.text)
  const blocklist = parseBlocklist()
  const hits = blocklist.filter(word => normalized.includes(word))

  if (hits.length > 0) {
    throw new AdminHttpError(400, 'PRIVACY_VIOLATION', `Privacy blocklist hit in ${input.label}`, {
      hits
    })
  }

  let replaced = 0
  let sanitized = input.text

  sanitized = sanitized.replace(EMAIL_RE, () => {
    replaced += 1
    return 'your-email@example.com'
  })

  sanitized = sanitized.replace(BLOG_HOST_RE, () => {
    replaced += 1
    return 'blog.your-domain.com'
  })

  sanitized = sanitized.replace(URL_RE, raw => {
    const host = getHostFromUrl(raw)
    if (!host || DEFAULT_ALLOWED_DOMAINS.has(host)) {
      return raw
    }
    if (/^blog\./i.test(host)) {
      replaced += 1
      return raw.replace(host, 'blog.your-domain.com')
    }
    return raw
  })

  return {
    sanitized,
    replaced
  }
}
