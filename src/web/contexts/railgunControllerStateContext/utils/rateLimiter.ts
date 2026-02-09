// A tiny leaky-bucket limiter so setTimeout pacing is guaranteed even if something re-entrantly calls getAllLogs
export class LocalRateLimiter {
  private lastCallAt = 0

  private minSpacingMs: number

  constructor(rps: number) {
    // rps=1.4 → ~714ms spacing
    this.minSpacingMs = Math.max(0, Math.floor(1000 / Math.max(0.1, rps)))
  }

  async wait() {
    const now = Date.now()
    const elapsed = now - this.lastCallAt
    const waitFor = this.minSpacingMs - elapsed
    if (waitFor > 0) {
      await new Promise((r) => setTimeout(r, waitFor))
    }
    this.lastCallAt = Date.now()
  }

  slowDown(factor = 0.75) {
    // increase spacing a bit (reduce rps)
    this.minSpacingMs = Math.floor(this.minSpacingMs / Math.max(0.25, factor))
  }
}
