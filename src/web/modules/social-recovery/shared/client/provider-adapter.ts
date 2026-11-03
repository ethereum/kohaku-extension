/**
 * The provider adapter: the SDK's `IProvider` over the extension's own
 * provider.
 *
 * That provider is the ethers provider `getRpcProvider` builds: ethers'
 * `JsonRpcProvider`, Ambire's `BrowserProvider` over the Helios light client
 * or `ColibriRpcProvider` with its prover. Each reads through its own JSON-RPC
 * `send`, so a read may route through a light client and its prover.
 *
 * The six reads are the SDK's list and nothing else: the chain id, one call
 * honouring `from` and a block tag, one log query over a filter and two
 * blocks, `block(tag)`, the code at an address and one transaction by its
 * hash. A reverted call rejects with its raw revert data (`RevertedCall`), and
 * a read the provider could not make rejects (`ProviderReadFailure`), never
 * answering empty. A read the node refused for its rate limit is made again
 * after a pause before it fails.
 */
import type {
  Address,
  BlockHeader,
  BlockRange,
  BlockTag,
  FilterSpec,
  Hex,
  IProvider,
  RawLog,
  RawTransaction
} from '@kohaku-eth/social-recovery'
import { getAddress, hexToBigInt, isHex } from 'viem'

import { delayPromise } from '@common/utils/promises'

import type {
  AdapterProvider,
  CodeRead,
  CodeReadProvider,
  ProviderLog,
  ProviderRead,
  ProviderReadFailure,
  RevertedCall,
  TransactionRead,
  TransactionReadProvider
} from './types'

/** Every read this folder makes through the extension's provider. */
export const PROVIDER_READS = [
  'chainId',
  'call',
  'logs',
  'block',
  'nativeBalance',
  'estimateGas',
  'gasPrice',
  'code',
  'transaction'
] as const

export const revertedCall = (read: RevertedCall['read'], data: Hex): RevertedCall => {
  const error = new Error('execution reverted') as RevertedCall
  error.name = 'RevertedCall'
  error.read = read
  error.data = data
  return error
}

export const providerReadFailure = (read: ProviderRead, cause: unknown): ProviderReadFailure => {
  const detail = cause instanceof Error ? cause.message : String(cause)
  const error = new Error(`The provider could not answer ${read}: ${detail}`) as ProviderReadFailure
  error.name = 'ProviderReadFailure'
  error.read = read
  error.cause = cause
  return error
}

export const isRevertedCall = (value: unknown): value is RevertedCall =>
  value instanceof Error && value.name === 'RevertedCall'

export const isProviderReadFailure = (value: unknown): value is ProviderReadFailure =>
  value instanceof Error && value.name === 'ProviderReadFailure'

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

/** A JSON-RPC quantity the node answered, as a bigint. Throws for anything else. */
export const quantityOf = (value: unknown): bigint => {
  if (!isHex(value)) {
    throw new Error(`not a quantity: ${JSON.stringify(value)}`)
  }
  return hexToBigInt(value)
}

const hexOf = (read: ProviderRead, value: unknown): Hex => {
  if (!isHex(value)) {
    throw providerReadFailure(read, new Error(`not hex: ${JSON.stringify(value)}`))
  }
  return value
}

// ---------------------------------------------------------------------------
// Revert data
// ---------------------------------------------------------------------------

const REVERT_WORD = /revert/i
const EXECUTION_REVERTED = /execution reverted/i

/**
 * Walks a thrown value for the raw revert data a node returned. ethers puts it
 * on its `CALL_EXCEPTION` (`data`) and keeps the node's own error under
 * `info.error`; a provider that bypasses ethers (Colibri) throws the node's
 * `{ code, message, data }` itself. Answers the data, `0x` for a revert that
 * carried none, or undefined where the value is not a revert at all.
 */
export const revertDataOf = (thrown: unknown): Hex | undefined => {
  const seen = new Set<unknown>()
  let revertedWithoutData = false

  const visit = (value: unknown, depth: number): Hex | undefined => {
    if (depth > 8 || value === null || value === undefined) {
      return undefined
    }
    if (typeof value === 'string') {
      if (!value.trim().startsWith('{')) {
        return undefined
      }
      try {
        return visit(JSON.parse(value), depth + 1)
      } catch {
        return undefined
      }
    }
    if (typeof value !== 'object' || seen.has(value)) {
      return undefined
    }
    seen.add(value)
    const record = value as Record<string, unknown>
    const message = typeof record.message === 'string' ? record.message : ''
    if (REVERT_WORD.test(message) && isHex(record.data)) {
      return record.data
    }
    if (record.code === 3 || EXECUTION_REVERTED.test(message)) {
      revertedWithoutData = true
    }
    const keys = Array.from(new Set([...Object.keys(record), 'info', 'error', 'data', 'cause']))
    let found: Hex | undefined
    keys.some((key) => {
      found = visit(record[key], depth + 1)
      return found !== undefined
    })
    return found
  }

  const data = visit(thrown, 0)
  if (data) {
    return data
  }
  return revertedWithoutData ? '0x' : undefined
}

/** The thrown value of a call or an estimate: a revert with its data, or a read failure. */
export const callFailureOf = (read: 'call' | 'estimateGas', thrown: unknown): Error => {
  if (isRevertedCall(thrown) || isProviderReadFailure(thrown)) {
    return thrown
  }
  const data = revertDataOf(thrown)
  return data === undefined ? providerReadFailure(read, thrown) : revertedCall(read, data)
}

// ---------------------------------------------------------------------------
// Rate limits
// ---------------------------------------------------------------------------

/**
 * A read the node refused for its rate limit is made again, up to this many
 * more times, after a pause that starts at `RATE_LIMIT_RETRY_MS` and doubles
 * each time. A read that answered is never made again, and any other failure
 * fails at once.
 */
export const RATE_LIMIT_RETRIES = 3
export const RATE_LIMIT_RETRY_MS = 1_000

/** The JSON-RPC codes a node refuses a read with for its rate limit: the usual one, the request-limit one and an HTTP 429 carried as a code. */
const RATE_LIMIT_CODES: readonly unknown[] = [-32005, -32007, 429]
const RATE_LIMIT_STATUS = 429
/** An HTTP 429 as ethers reports it, also inside the 599 it escalates to once its throttle gives up. */
const RATE_LIMIT_RESPONSE_STATUS = /(^|\()429\b/
const RATE_LIMIT_MESSAGE = /too many requests|rate limit/i

const fieldOf = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined

/**
 * Whether a thrown value is the node refusing a read for its rate limit: a
 * rate-limit JSON-RPC code on the error itself (a provider that bypasses ethers),
 * on ethers' `error` (a coalesced JSON-RPC error) or on ethers' `info.error`
 * (a call or an estimate), an HTTP 429, or a message that names the rate
 * limit. A revert is never rate-limited.
 */
export const rateLimited = (thrown: unknown): boolean => {
  if (isProviderReadFailure(thrown)) {
    return rateLimited(thrown.cause)
  }
  if (isRevertedCall(thrown) || revertDataOf(thrown) !== undefined) {
    return false
  }
  const nodeErrors = [thrown, fieldOf(thrown, 'error'), fieldOf(fieldOf(thrown, 'info'), 'error')]
  if (nodeErrors.some((error) => RATE_LIMIT_CODES.includes(fieldOf(error, 'code')))) {
    return true
  }
  const status = fieldOf(fieldOf(thrown, 'info'), 'responseStatus')
  if (
    (typeof status === 'string' && RATE_LIMIT_RESPONSE_STATUS.test(status)) ||
    fieldOf(fieldOf(thrown, 'response'), 'statusCode') === RATE_LIMIT_STATUS
  ) {
    return true
  }
  return nodeErrors.some((error) => {
    const message = fieldOf(error, 'message')
    return typeof message === 'string' && RATE_LIMIT_MESSAGE.test(message)
  })
}

/** Runs `run`, again after each doubling pause while it fails for the node's rate limit. */
export const retryWhileRateLimited = async <T>(
  run: () => Promise<T>,
  retriesLeft = RATE_LIMIT_RETRIES,
  pauseMs = RATE_LIMIT_RETRY_MS
): Promise<T> => {
  try {
    return await run()
  } catch (thrown) {
    if (retriesLeft === 0 || !rateLimited(thrown)) {
      throw thrown
    }
    await delayPromise(pauseMs)
    return retryWhileRateLimited(run, retriesLeft - 1, pauseMs * 2)
  }
}

/**
 * Runs one read, again while the node refuses it for its rate limit; a
 * rejection becomes a `ProviderReadFailure` naming the read.
 */
export const attemptRead = async <T>(read: ProviderRead, run: () => Promise<T>): Promise<T> => {
  try {
    return await retryWhileRateLimited(run)
  } catch (thrown) {
    throw isProviderReadFailure(thrown) ? thrown : providerReadFailure(read, thrown)
  }
}

// ---------------------------------------------------------------------------
// The four reads
// ---------------------------------------------------------------------------

const rawLogOf = (log: ProviderLog): RawLog => ({
  address: hexOf('logs', log.address) as Address,
  topics: log.topics.map((topic) => hexOf('logs', topic)),
  data: hexOf('logs', log.data),
  blockNumber: log.blockNumber,
  blockHash: hexOf('logs', log.blockHash),
  logIndex: log.index,
  transactionHash: hexOf('logs', log.transactionHash),
  removed: log.removed
})

/**
 * The provider adapter over the extension's provider. Each read is one call on
 * that provider:
 *
 * - `chainId()`: `eth_chainId` through `send`, so the answer is the
 *   connection's own and not the provider's network record.
 * - `call(to, data, from, block)`: `call` over `{ to, data }`, with `from`
 *   where one is given, at the block tag.
 * - `logs(filterSpec, range)`: `getLogs` over the filter's addresses and
 *   topics and the range's two blocks. ethers lowercases the topics, sorts
 *   and dedupes each topic list and sorts the addresses, which matches the
 *   same logs.
 * - `block(tag)`: `getBlock` at the tag without transactions; a block the node
 *   does not have is a failure, not an empty header.
 */
export const createProviderAdapter = (provider: AdapterProvider): IProvider => ({
  chainId(): Promise<number> {
    return attemptRead('chainId', async () => {
      const chainId = quantityOf(await provider.send('eth_chainId', []))
      if (chainId > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error(`quantity out of range: ${chainId}`)
      }
      return Number(chainId)
    })
  },

  async call(to: Address, data: Hex, from: Address, block: BlockTag): Promise<Hex> {
    let answer: string
    try {
      answer = await retryWhileRateLimited(() => provider.call({ to, data, from, blockTag: block }))
    } catch (thrown) {
      throw callFailureOf('call', thrown)
    }
    return hexOf('call', answer)
  },

  logs(filterSpec: FilterSpec, range: BlockRange): Promise<RawLog[]> {
    return attemptRead('logs', async () => {
      const logs = await provider.getLogs({
        address: [...filterSpec.address],
        topics: filterSpec.topics.map((topic) =>
          topic === null || typeof topic === 'string' ? topic : [...topic]
        ),
        fromBlock: range.from,
        toBlock: range.to
      })
      return logs.map(rawLogOf)
    })
  },

  async block(tag: BlockTag): Promise<BlockHeader> {
    const header = await attemptRead('block', () => provider.getBlock(tag))
    if (!header) {
      throw providerReadFailure('block', new Error(`the node has no block at ${String(tag)}`))
    }
    return {
      number: header.number,
      timestamp: header.timestamp,
      hash: hexOf('block', header.hash)
    }
  },

  code(address: Address, block: BlockTag): Promise<Hex> {
    return attemptRead('code', async () => hexOf('code', await provider.getCode(address, block)))
  },

  transaction(hash: Hex): Promise<RawTransaction | undefined> {
    return attemptRead('transaction', async () => {
      const transaction = await provider.getTransaction(hash)
      if (!transaction || transaction.blockNumber === null || transaction.blockHash === null) {
        return undefined
      }
      return {
        hash: hexOf('transaction', transaction.hash),
        from: getAddress(transaction.from),
        to: transaction.to === null ? null : getAddress(transaction.to),
        input: hexOf('transaction', transaction.data),
        blockNumber: transaction.blockNumber,
        blockHash: hexOf('transaction', transaction.blockHash)
      }
    })
  }
})

/**
 * The code read over the extension's provider: `getCode` at the block tag. A
 * read the provider could not make, or an answer that is not hex, rejects
 * with a `ProviderReadFailure`.
 */
export const createCodeRead = (provider: CodeReadProvider): CodeRead => ({
  code(address: Address, block: BlockTag = 'latest'): Promise<Hex> {
    return attemptRead('code', async () => hexOf('code', await provider.getCode(address, block)))
  }
})

/**
 * The transaction read over the extension's provider: `getTransaction` of the
 * hash, its sender checksummed, or null where the node knows no such
 * transaction. A read the provider could not make, or a sender that is not
 * an address, rejects with a `ProviderReadFailure`.
 */
export const createTransactionRead =
  (provider: TransactionReadProvider): TransactionRead =>
  (hash: Hex): Promise<Address | null> =>
    attemptRead('transaction', async () => {
      const transaction = await provider.getTransaction(hash)
      return transaction ? getAddress(transaction.from) : null
    })
