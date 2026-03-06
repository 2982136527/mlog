type Bucket = {
  count: number
  resetAt: number
}

const STORE_KEY = '__mlog_forum_rate_limit__'

type GlobalStore = {
  [STORE_KEY]?: Map<string, Bucket>
}

function getStore(): Map<string, Bucket> {
  const globalRef = globalThis as typeof globalThis & GlobalStore
  if (!globalRef[STORE_KEY]) {
    globalRef[STORE_KEY] = new Map<string, Bucket>()
  }
  return globalRef[STORE_KEY]
}

export function checkForumRateLimit(input: {
  key: string
  limit: number
  windowMs: number
}): {
  allowed: boolean
  remaining: number
  resetAt: number
} {
  const now = Date.now()
  const store = getStore()
  const existing = store.get(input.key)

  if (!existing || existing.resetAt <= now) {
    const next: Bucket = {
      count: 1,
      resetAt: now + input.windowMs
    }
    store.set(input.key, next)
    return {
      allowed: true,
      remaining: Math.max(0, input.limit - 1),
      resetAt: next.resetAt
    }
  }

  if (existing.count >= input.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt
    }
  }

  existing.count += 1
  store.set(input.key, existing)

  return {
    allowed: true,
    remaining: Math.max(0, input.limit - existing.count),
    resetAt: existing.resetAt
  }
}
