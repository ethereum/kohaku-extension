/**
 * A read the node refuses for its rate limit is made again after a pause that
 * doubles from one second, up to three more times, and then fails as any
 * failed read does with the last refusal. A read that answered, a revert and
 * any other failure are never made again. The refusals are built the way
 * ethers v6 builds them from the node's answer; Jest's fake clock runs the
 * pauses.
 */
import { AbiCoder, FetchRequest, FetchResponse, JsonRpcApiProvider, makeError } from 'ethers'
import { zeroHash } from 'viem'

import type { Address, Hex } from '@kohaku-eth/social-recovery'
import { createChainReads } from '@web/modules/social-recovery/shared/client/chain-reads'
import { advanceClock } from '@web/modules/social-recovery/shared/client/events/__fixtures__/retries'
import {
  createCodeRead,
  createProviderAdapter,
  createTransactionRead,
  isProviderReadFailure,
  isRevertedCall,
  providerReadFailure,
  RATE_LIMIT_RETRY_MS,
  rateLimited
} from '@web/modules/social-recovery/shared/client/provider-adapter'

const TO: Address = '0x1111111111111111111111111111111111111111'
const DATA: Hex = '0xdeadbeef'
const ANSWER: Hex = `0x${'00'.repeat(31)}01`
const REVERT: Hex = `0x08c379a0${'00'.repeat(31)}20`
const SENDER: Address = '0xc18a000000000000000000000000000000000abC'

const TOO_MANY = { code: -32005, message: 'Too Many Requests' }

/** The error ethers' JSON-RPC provider throws for one item of a batch the node answered with `error`. */
const nodeAnswered = (method: string, error: { code: number; message: string; data?: Hex }) =>
  JsonRpcApiProvider.prototype.getRpcError.call(
    undefined,
    { method, params: [{ to: TO, data: DATA }], id: 1, jsonrpc: '2.0' },
    { id: 1, error }
  )

/**
 * The error ethers' fetch throws for a failed HTTP status: as the node sent
 * it, or escalated to a 599 with `message` once ethers' throttle gives up.
 */
const httpFailure = (status: number, statusMessage: string, message = ''): unknown => {
  try {
    const response = new FetchResponse(status, statusMessage, {}, null)
    ;(message ? response.makeServerError(message) : response).assertOk()
  } catch (thrown) {
    return thrown
  }
  throw new Error('assertOk did not throw')
}

/** The HTTP 429 refusal once ethers' own throttle has given up on it, the shape a read meets. */
const http429 = (statusMessage: string): unknown =>
  httpFailure(429, statusMessage, 'exceeded maximum retry limit')

/** The error ethers' fetch throws once a request outlives its timeout. */
const timeout = () =>
  makeError('timeout', 'TIMEOUT', {
    operation: 'request.send',
    reason: 'timeout',
    request: new FetchRequest('data:,')
  })

const thrownBy = (run: Promise<unknown>): Promise<unknown> =>
  run.then(
    () => undefined,
    (e: unknown) => e
  )

/** A mocked member that rejects with each refusal in turn, then answers. */
const refusingThen = <T>(refusals: unknown[], answer: T) => {
  const member = jest.fn(async (): Promise<T> => answer)
  refusals.forEach((refusal) => member.mockRejectedValueOnce(refusal))
  return member
}

const triesAfter = async (member: jest.Mock, ms: number): Promise<number> => {
  await advanceClock(ms)
  return member.mock.calls.length
}

const adapterOf = (members: Record<string, jest.Mock>) =>
  createProviderAdapter(members as unknown as Parameters<typeof createProviderAdapter>[0])

const codeReadOf = (getCode: jest.Mock) =>
  createCodeRead({ getCode } as unknown as Parameters<typeof createCodeRead>[0])

const transactionReadOf = (getTransaction: jest.Mock) =>
  createTransactionRead({ getTransaction } as unknown as Parameters<
    typeof createTransactionRead
  >[0])

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('a call the node refuses for its rate limit', () => {
  it('is made again after one second and then two, and answers', async () => {
    const refusal = nodeAnswered('eth_call', TOO_MANY)
    const call = refusingThen([refusal, refusal], ANSWER)
    const read = adapterOf({ call }).call(
      TO,
      DATA,
      '0x0000000000000000000000000000000000000000',
      'latest'
    )
    expect(await triesAfter(call, 0)).toBe(1)
    expect(await triesAfter(call, RATE_LIMIT_RETRY_MS - 1)).toBe(1)
    expect(await triesAfter(call, 1)).toBe(2)
    expect(await triesAfter(call, 2 * RATE_LIMIT_RETRY_MS - 1)).toBe(2)
    expect(await triesAfter(call, 1)).toBe(3)
    await expect(read).resolves.toBe(ANSWER)
    expect(await triesAfter(call, 60_000)).toBe(3)
  })

  it('fails as a failed call read with the last refusal after the fourth try', async () => {
    const last = nodeAnswered('eth_call', TOO_MANY)
    const refusal = nodeAnswered('eth_call', TOO_MANY)
    const call = refusingThen([refusal, refusal, refusal, last], ANSWER)
    const read = thrownBy(
      adapterOf({ call }).call(TO, DATA, '0x0000000000000000000000000000000000000000', 'latest')
    )
    expect(await triesAfter(call, 7 * RATE_LIMIT_RETRY_MS - 1)).toBe(3)
    expect(await triesAfter(call, 1)).toBe(4)
    const thrown = await read
    expect(isProviderReadFailure(thrown)).toBe(true)
    expect(thrown).toMatchObject({ read: 'call', cause: last })
    expect(await triesAfter(call, 60_000)).toBe(4)
  })
})

describe('a failure that is not the rate limit', () => {
  it('is a revert made once, rejecting with its revert data', async () => {
    const call = refusingThen(
      [nodeAnswered('eth_call', { code: 3, message: 'execution reverted', data: REVERT })],
      ANSWER
    )
    const read = thrownBy(
      adapterOf({ call }).call(TO, DATA, '0x0000000000000000000000000000000000000000', 'latest')
    )
    await advanceClock(60_000)
    const thrown = await read
    expect(isRevertedCall(thrown)).toBe(true)
    expect(thrown).toMatchObject({ read: 'call', data: REVERT })
    expect(call).toHaveBeenCalledTimes(1)
  })

  it('is a transport fault made once, rejecting as a failed read', async () => {
    const fault = timeout()
    const getCode = refusingThen([fault], '0x60')
    const read = thrownBy(codeReadOf(getCode).code(TO))
    await advanceClock(60_000)
    const thrown = await read
    expect(isProviderReadFailure(thrown)).toBe(true)
    expect(thrown).toMatchObject({ read: 'code', cause: fault })
    expect(getCode).toHaveBeenCalledTimes(1)
  })
})

describe('the other reads the node refuses for its rate limit', () => {
  it('reads the code again after a second, and answers it', async () => {
    const getCode = refusingThen([nodeAnswered('eth_getCode', TOO_MANY)], '0x60')
    const read = codeReadOf(getCode).code(TO)
    expect(await triesAfter(getCode, RATE_LIMIT_RETRY_MS - 1)).toBe(1)
    expect(await triesAfter(getCode, 1)).toBe(2)
    await expect(read).resolves.toBe('0x60')
  })

  it('fails the code read with the last refusal after the fourth try', async () => {
    const last = nodeAnswered('eth_getCode', TOO_MANY)
    const refusal = nodeAnswered('eth_getCode', TOO_MANY)
    const getCode = refusingThen([refusal, refusal, refusal, last], '0x60')
    const read = thrownBy(codeReadOf(getCode).code(TO))
    await advanceClock(7 * RATE_LIMIT_RETRY_MS)
    expect(await read).toMatchObject({ name: 'ProviderReadFailure', read: 'code', cause: last })
    expect(getCode).toHaveBeenCalledTimes(4)
  })

  it('reads the transaction again after one second and then two, and answers its sender', async () => {
    const getTransaction = refusingThen([http429('Too Many Requests'), http429('')], {
      from: SENDER.toLowerCase()
    })
    const read = transactionReadOf(getTransaction)(zeroHash)
    expect(await triesAfter(getTransaction, RATE_LIMIT_RETRY_MS)).toBe(2)
    expect(await triesAfter(getTransaction, 2 * RATE_LIMIT_RETRY_MS - 1)).toBe(2)
    expect(await triesAfter(getTransaction, 1)).toBe(3)
    await expect(read).resolves.toBe(SENDER)
  })

  it('fails the transaction read with the last refusal after the fourth try', async () => {
    const last = http429('Too Many Requests')
    const getTransaction = refusingThen([http429(''), http429(''), http429(''), last], null)
    const read = thrownBy(transactionReadOf(getTransaction)(zeroHash))
    await advanceClock(7 * RATE_LIMIT_RETRY_MS)
    const thrown = await read
    expect(thrown).toMatchObject({ name: 'ProviderReadFailure', read: 'transaction' })
    expect((thrown as { cause: unknown }).cause).toBe(last)
    expect(getTransaction).toHaveBeenCalledTimes(4)
  })

  it('reads the logs, the block and the chain id again after a second', async () => {
    const getLogs = refusingThen([nodeAnswered('eth_getLogs', TOO_MANY)], [])
    const getBlock = refusingThen([nodeAnswered('eth_getBlockByNumber', TOO_MANY)], {
      number: 7,
      timestamp: 9,
      hash: zeroHash
    })
    const send = refusingThen([nodeAnswered('eth_chainId', TOO_MANY)], '0xaa36a7')
    const adapter = adapterOf({ getLogs, getBlock, send })
    const reads = Promise.all([
      adapter.logs({ address: [TO], topics: [] }, { from: 1, to: 2 }),
      adapter.block('latest'),
      adapter.chainId()
    ])
    await advanceClock(RATE_LIMIT_RETRY_MS)
    await expect(reads).resolves.toEqual([
      [],
      { number: 7, timestamp: 9, hash: zeroHash },
      11155111
    ])
    expect([getLogs, getBlock, send].map((m) => m.mock.calls.length)).toEqual([2, 2, 2])
  })

  it('estimates the gas again after a second, and answers the estimate', async () => {
    const estimateGas = refusingThen([nodeAnswered('eth_estimateGas', TOO_MANY)], 21_000n)
    const reads = createChainReads({ estimateGas } as unknown as Parameters<
      typeof createChainReads
    >[0])
    const read = reads.estimateGas({ from: SENDER, to: TO, data: DATA, value: 0n })
    expect(await triesAfter(estimateGas, RATE_LIMIT_RETRY_MS)).toBe(2)
    await expect(read).resolves.toBe(21_000n)
  })
})

describe('what reads as the rate limit', () => {
  const RATE_LIMITED: [string, unknown][] = [
    ['the node error a provider that bypasses ethers throws', { ...TOO_MANY }],
    [
      'a request-limit code in a batch item',
      nodeAnswered('eth_getLogs', { code: -32007, message: 'request limit reached' })
    ],
    [
      'an HTTP status carried as the item code',
      nodeAnswered('eth_call', {
        code: 429,
        message: 'exceeded its compute units per second capacity'
      })
    ],
    ["ethers' coalesced JSON-RPC error of a log query", nodeAnswered('eth_getLogs', TOO_MANY)],
    ["ethers' call exception carrying the node error", nodeAnswered('eth_call', TOO_MANY)],
    [
      "ethers' estimate exception carrying the node error",
      nodeAnswered('eth_estimateGas', TOO_MANY)
    ],
    ["ethers' server error once its throttle gives up on HTTP 429", http429('Too Many Requests')],
    ['an HTTP 429 with no status text', http429('')],
    ['an HTTP 429 ethers did not throttle', httpFailure(429, '')],
    ['a message that says too many requests', new Error('too many requests, slow down')],
    ['a message that names the rate limit', new Error('Rate Limit exceeded for this key')],
    [
      'a node error with another code that names the rate limit',
      nodeAnswered('eth_getCode', { code: -32000, message: 'request rate limited' })
    ],
    [
      'a failed read whose cause is the rate limit',
      providerReadFailure('logs', nodeAnswered('eth_getLogs', TOO_MANY))
    ]
  ]

  const NOT_RATE_LIMITED: [string, unknown][] = [
    [
      'a revert',
      nodeAnswered('eth_call', { code: 3, message: 'execution reverted', data: REVERT })
    ],
    [
      'a revert whose reason names the rate limit',
      nodeAnswered('eth_call', {
        code: 3,
        message: 'execution reverted: rate limit',
        data: `0x08c379a0${AbiCoder.defaultAbiCoder().encode(['string'], ['rate limit']).slice(2)}`
      })
    ],
    [
      'a pruned-history answer',
      nodeAnswered('eth_getLogs', { code: -32000, message: 'missing trie node abc (path )' })
    ],
    [
      'a block the node no longer has',
      nodeAnswered('eth_getBlockByNumber', { code: -32000, message: 'header not found' })
    ],
    ['a transport fault', makeError('fetch failed', 'NETWORK_ERROR', { event: 'request' })],
    ['a timeout', timeout()],
    ['an HTTP 502', httpFailure(502, 'Bad Gateway')],
    ['a failed read whose cause is a timeout', providerReadFailure('code', new Error('timeout'))]
  ]

  RATE_LIMITED.forEach(([name, thrown]) => {
    it(`recognises ${name}`, () => {
      expect(rateLimited(thrown)).toBe(true)
    })
  })

  NOT_RATE_LIMITED.forEach(([name, thrown]) => {
    it(`does not take ${name} for the rate limit`, () => {
      expect(rateLimited(thrown)).toBe(false)
    })
  })
})
