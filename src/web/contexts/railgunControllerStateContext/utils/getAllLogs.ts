// ─────────────────────────────────────────────────────────────────────────────
// ROBUST local getAllLogs with pacing, backoff, adaptive chunk
// ─────────────────────────────────────────────────────────────────────────────

import { JsonRpcProvider, Log } from 'ethers'
import { LocalRateLimiter } from './rateLimiter'
import { isTooManyRequests, isRangeErr } from './errorDetection'

export const getAllLogs = async (
  provider: JsonRpcProvider,
  railgunAddress: string,
  startBlock: number,
  endBlock: number
) => {
  if (endBlock < startBlock) return []

  // Start conservative; grow on success, shrink on error.
  const MAX_BATCH = 4000
  const MIN_BATCH = 250
  let batch = Math.min(2000, Math.max(MIN_BATCH, endBlock - startBlock + 1))

  // Base spacing between requests (in addition to limiter). Keep your original intent but slightly slower.
  const BASE_DELAY_MS = 1200

  // Exponential backoff window when we hit 429. Resets on any success.
  let backoffMs = 0
  const BACKOFF_BASE_MS = 2000
  const BACKOFF_MAX_MS = 20000

  // Additional tiny jitter so multiple tabs/processes don’t align perfectly.
  const jitter = () => Math.floor(Math.random() * 120)

  // Leaky bucket limiter: ~1.4 rps steady-state (independent of BASE_DELAY_MS)
  const limiter = new LocalRateLimiter(1.4)

  let from = startBlock
  const allLogs: Log[] = []

  console.log('[RailgunContext - getAllLogs] getting logs from', from, 'to', endBlock)
  let i = 0

  while (from <= endBlock) {
    const to = Math.min(from + batch - 1, endBlock)

    if (i % 10 === 0) {
      console.log(
        '[RailgunContext - getAllLogs] getting logs batch',
        i,
        `range=[${from},${to}] chunk=${batch}`
      )
    }
    i++

    try {
      // 1) limiter spacing
      await limiter.wait()
      // 2) base delay + jitter
      await new Promise(r => setTimeout(r, BASE_DELAY_MS + jitter()))
      // 3) any active backoff from a previous 429
      if (backoffMs > 0) {
        console.warn('[RailgunContext - getAllLogs] backing off before call:', backoffMs, 'ms (chunk=', batch, ')')
        await new Promise(r => setTimeout(r, backoffMs + jitter()))
      }

      const logs = await provider.getLogs({
        address: railgunAddress,
        fromBlock: from,
        toBlock: to,
      })

      // success: append, advance, gently grow chunk, clear backoff
      allLogs.push(...logs)
      from = to + 1
      backoffMs = 0
      // grow chunk a bit, but keep under MAX_BATCH
      batch = Math.min(MAX_BATCH, Math.floor(batch * 1.25))

    } catch (e: any) {
      // Handle rate-limit first
      if (isTooManyRequests(e)) {
        // slow the limiter and increase backoff
        limiter.slowDown(0.75)
        backoffMs = backoffMs
          ? Math.min(BACKOFF_MAX_MS, Math.floor(backoffMs * 2))
          : BACKOFF_BASE_MS

        // shrink chunk to lighten each request
        batch = Math.max(MIN_BATCH, Math.floor(batch / 2))

        console.warn(
          '[RailgunContext - getAllLogs] 429 Too Many Requests:',
          `nextBackoff=${backoffMs}ms`,
          `newChunk=${batch}`
        )
        // loop continues, retry same "from" after backoff
        continue
      }

      // Range-y errors: shrink chunk and retry
      if (isRangeErr(e)) {
        if (batch > MIN_BATCH) {
          batch = Math.max(MIN_BATCH, Math.floor(batch / 2))
          console.warn('[RailgunContext - getAllLogs] range error; shrinking chunk to', batch)
          // small pause so we don’t thrash
          await new Promise(r => setTimeout(r, 600 + jitter()))
          continue
        }
        // single-block still fails → skip the block (same behavior you had)
        console.warn(
          '[RailgunContext - getAllLogs] single-block still failing; skipping block',
          from
        )
        from = to + 1
        continue
      }

      // Anything else: bubble up
      console.error('[RailgunContext - getAllLogs] unexpected error', e)
      throw e
    }
  }

  return allLogs
}
