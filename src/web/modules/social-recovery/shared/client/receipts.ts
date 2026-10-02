/**
 * The receipt wait: a transaction the wallet broadcast, waited for over the
 * extension's own provider with ethers' own wait.
 *
 * The wait runs on ethers' transaction response, whose `wait()` answers the
 * receipt, throws `CALL_EXCEPTION` with the receipt for a transaction that
 * reverted, and throws `TRANSACTION_REPLACED` for one that another
 * transaction with the same nonce took the place of. ethers scans for that
 * replacement only from the block it is given, so the caller reads the block
 * before the send, as ethers' own signer does before it broadcasts. Where the
 * node does not know the transaction yet, the wait asks again at each new
 * block. Every error comes through as ethers threw it.
 *
 * A destroyed provider drops its block listeners without settling the waits
 * on them, so the caller that destroys the provider releases the wait first
 * through the signal, and every wait in flight rejects naming its hash.
 */
import type { Hex } from '@web/modules/social-recovery/sdk-interfaces'

import type {
  ProviderTransaction,
  ReceiptProvider,
  ReceiptWait,
  ReceiptWaitOptions,
  ReceiptWaitReleased
} from './types'

/**
 * How long the wait asks for a transaction the node does not know before it
 * gives up: the time after which the wallet's own activity calls a broadcast
 * with no transaction and no receipt stuck.
 */
export const UNKNOWN_TRANSACTION_MS = 15 * 60 * 1000

const released = (transactionHash: Hex): ReceiptWaitReleased =>
  Object.assign(
    new Error(`The provider was released before the receipt of ${transactionHash} came back.`),
    { name: 'ReceiptWaitReleased' as const, transactionHash }
  )

/** The transaction once the node knows it, asked again at each new block. */
const knownTransaction = (
  provider: ReceiptProvider,
  hash: Hex,
  signal: AbortSignal | undefined
): Promise<ProviderTransaction> =>
  new Promise<ProviderTransaction>((resolve, reject) => {
    const started = Date.now()
    let onRelease: (() => void) | undefined
    const settle = (settled: () => void): void => {
      if (onRelease) {
        signal?.removeEventListener('abort', onRelease)
      }
      settled()
    }
    const ask = async (): Promise<void> => {
      try {
        const transaction = await provider.getTransaction(hash)
        if (signal?.aborted) {
          return
        }
        if (transaction) {
          settle(() => resolve(transaction))
        } else if (Date.now() - started >= UNKNOWN_TRANSACTION_MS) {
          settle(() => reject(new Error(`The node does not know transaction ${hash}.`)))
        } else {
          await provider.once('block', ask)
        }
      } catch (thrown) {
        settle(() => reject(thrown))
      }
    }
    if (signal?.aborted) {
      reject(released(hash))
      return
    }
    onRelease = () => {
      reject(released(hash))
      provider.off('block', ask).catch(() => undefined)
    }
    signal?.addEventListener('abort', onRelease, { once: true })
    ask().catch((thrown) => settle(() => reject(thrown)))
  })

/** The run's answer, or the release's rejection, whichever comes first. */
const untilReleased = <T>(
  signal: AbortSignal | undefined,
  transactionHash: Hex,
  run: Promise<T>
): Promise<T> => {
  if (!signal) {
    return run
  }
  if (signal.aborted) {
    return Promise.reject(released(transactionHash))
  }
  return new Promise<T>((resolve, reject) => {
    const onRelease = (): void => reject(released(transactionHash))
    signal.addEventListener('abort', onRelease, { once: true })
    run.then(resolve, reject).finally(() => signal.removeEventListener('abort', onRelease))
  })
}

export const createReceiptWait = (
  provider: ReceiptProvider,
  { signal }: ReceiptWaitOptions = {}
): ReceiptWait => ({
  blockNumber: () => provider.getBlockNumber(),

  async wait(transactionHash: Hex, startBlock: number) {
    const transaction = await knownTransaction(provider, transactionHash, signal)
    const receipt = await untilReleased(
      signal,
      transactionHash,
      transaction.replaceableTransaction(startBlock).wait()
    )
    // ethers answers no receipt only for a wait of zero confirmations.
    if (!receipt) {
      throw new Error(`No receipt came back for ${transactionHash}.`)
    }
    return receipt
  }
})
