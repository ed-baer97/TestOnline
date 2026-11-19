export function createRateLimiter({ windowMs, max, maxKeys = 5000 }) {
  const entries = new Map()

  function prune(now) {
    for (const [key, entry] of entries) {
      if (now - entry.start > windowMs) entries.delete(key)
    }
    while (entries.size >= maxKeys) {
      const oldest = entries.keys().next().value
      if (oldest === undefined) break
      entries.delete(oldest)
    }
  }

  return {
    isBlocked(key, now = Date.now()) {
      const entry = entries.get(key)
      if (!entry) return false
      if (now - entry.start > windowMs) {
        entries.delete(key)
        return false
      }
      return entry.count >= max
    },
    hit(key, now = Date.now()) {
      if (!entries.has(key) && entries.size >= maxKeys) prune(now)
      const current = entries.get(key)
      if (!current || now - current.start > windowMs) {
        entries.set(key, { count: 1, start: now })
      } else {
        current.count += 1
      }
    },
    reset(key) {
      entries.delete(key)
    },
    clear() {
      entries.clear()
    },
  }
}
