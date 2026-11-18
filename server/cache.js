/**
 * One cached dataset with TTL, single-flight and stale-on-error: simultaneous
 * viewers share one upstream pull, and a failed refresh keeps serving the last
 * good data (flagged stale) instead of blanking the dashboard.
 */
export function createCache(produce, ttlMs) {
  let value = null
  let storedAt = 0
  let inFlight = null
  let lastError = null

  async function refresh() {
    if (inFlight) return inFlight
    inFlight = (async () => {
      try {
        value = await produce()
        storedAt = Date.now()
        lastError = null
        return value
      } catch (err) {
        lastError = err
        throw err
      } finally {
        inFlight = null
      }
    })()
    return inFlight
  }

  return {
    async get({ force = false } = {}) {
      const fresh = value && Date.now() - storedAt < ttlMs
      if (fresh && !force) return { value, stale: false, storedAt }
      try {
        await refresh()
        return { value, stale: false, storedAt }
      } catch (err) {
        if (value) return { value, stale: true, storedAt, error: err }
        throw err
      }
    },
    peek: () => ({ value, storedAt, lastError, refreshing: Boolean(inFlight) }),
  }
}
