type RateLimitEntry = {
  tokens: number
  expiresAt: number
}

const DEFAULT_LIMIT = Number(process.env.PUBLIC_INTAKE_RATE_LIMIT ?? 5)
const DEFAULT_WINDOW_MS = Number(process.env.PUBLIC_INTAKE_RATE_WINDOW_MS ?? 60_000)

const buckets = new Map<string, RateLimitEntry>()

export class RateLimitError extends Error {
  retryAfter: number
  constructor(message: string, retryAfter: number) {
    super(message)
    this.name = 'RateLimitError'
    this.retryAfter = retryAfter
  }
}

type RateLimitOptions = {
  limit?: number
  windowMs?: number
}

export function assertNotRateLimited(key: string, options: RateLimitOptions = {}): void {
  const limit = options.limit ?? DEFAULT_LIMIT
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS
  const now = Date.now()

  const entry = buckets.get(key)
  if (!entry || entry.expiresAt <= now) {
    buckets.set(key, { tokens: 1, expiresAt: now + windowMs })
    return
  }

  if (entry.tokens >= limit) {
    const retryAfter = Math.max(0, Math.ceil((entry.expiresAt - now) / 1000))
    // eslint-disable-next-line no-console
    console.warn(
      '[rate-limit] blocked request',
      JSON.stringify({ key, limit, windowMs, retryAfter, at: new Date().toISOString() })
    )
    throw new RateLimitError('Rate limit exceeded', retryAfter)
  }

  entry.tokens += 1
}

export function resetRateLimit(key: string): void {
  buckets.delete(key)
}

export function clearRateLimits(): void {
  buckets.clear()
}
