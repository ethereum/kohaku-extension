/**
 * Whether a read at a past block was refused because the node keeps no state
 * that old: the JSON-RPC code 4444 or one of the phrases nodes answer for it
 * (a pruned or unavailable history, or geth's missing trie node), on the error
 * itself, on the node's error ethers keeps under `error` or `info.error`, or
 * on the cause the provider adapter wraps. A rate limit, a timeout, a message
 * that says "pruned" in another sense or any other failure is no such refusal.
 */
const PRUNED_HISTORY_CODE = 4444
const PRUNED_HISTORY_MESSAGE = /pruned history unavailable|history unavailable|missing trie node/i
const NESTED = ['cause', 'error', 'info'] as const

export const historyRefused = (thrown: unknown, depth = 0): boolean => {
  if (depth > 4 || typeof thrown !== 'object' || thrown === null) {
    return false
  }
  const record = thrown as Record<string, unknown>
  if (record.code === PRUNED_HISTORY_CODE) {
    return true
  }
  if (typeof record.message === 'string' && PRUNED_HISTORY_MESSAGE.test(record.message)) {
    return true
  }
  return NESTED.some((key) => historyRefused(record[key], depth + 1))
}
