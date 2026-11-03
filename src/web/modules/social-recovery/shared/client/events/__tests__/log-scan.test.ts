/**
 * A chunked log scan over a node that refuses some chunk reads: a refused
 * chunk is read again after a pause that doubles from one second, a chunk
 * that answered is never read again, and the scan fails with the last
 * refusal only once the retries are spent. A refusal for the node's rate
 * limit, which the provider adapter already read again, fails the scan at
 * once. Jest's fake clock runs the pauses.
 */
import { pad, zeroHash } from 'viem'

import type { Address, BlockRange, FilterSpec, RawLog } from '@kohaku-eth/social-recovery'
import { LOG_CHUNK_RETRY_MS, logsInChunks } from '@web/modules/social-recovery/shared/client/events'
import {
  advanceClock,
  pastRetryPauses
} from '@web/modules/social-recovery/shared/client/events/__fixtures__/retries'
import { providerReadFailure } from '@web/modules/social-recovery/shared/client/provider-adapter'

const MANAGER: Address = '0x4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d'
const FILTER: FilterSpec = { address: [MANAGER], topics: [] }
const SCAN = { from: 100, to: 20_200 }

const logAt = (blockNumber: number): RawLog => ({
  address: MANAGER,
  topics: [],
  data: '0x',
  blockNumber,
  blockHash: pad(`0x${blockNumber.toString(16)}`),
  logIndex: 0,
  transactionHash: zeroHash,
  removed: false
})

const LOGS = [logAt(150), logAt(10_150), logAt(20_150)]

const nodeOf = () => {
  const logs = jest.fn(async (_filter: FilterSpec, range: BlockRange) =>
    LOGS.filter(({ blockNumber }) => blockNumber >= range.from && blockNumber <= range.to)
  )
  const provider = {
    chainId: jest.fn(async () => 11155111),
    call: jest.fn(async () => zeroHash),
    logs,
    block: jest.fn(async () => ({ number: SCAN.to, timestamp: 0, hash: zeroHash }))
  }
  const ranges = () => logs.mock.calls.map(([, range]) => range)
  return { provider, logs, ranges }
}

const refused = (attempt: number) =>
  providerReadFailure('logs', new Error(`bad gateway (${attempt})`))

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('a chunk the node refuses', () => {
  it('is read again after a second, and the scan answers every log in chain order with no gap', async () => {
    const { provider, logs, ranges } = nodeOf()
    logs.mockResolvedValueOnce([LOGS[0]]).mockRejectedValueOnce(refused(1))
    const read = logsInChunks(provider, FILTER, SCAN)
    await advanceClock(LOG_CHUNK_RETRY_MS - 1)
    expect(ranges()).toEqual([
      { from: 100, to: 10_099 },
      { from: 10_100, to: 20_099 }
    ])
    await advanceClock(1)
    await expect(read).resolves.toEqual(LOGS)
    expect(ranges()).toEqual([
      { from: 100, to: 10_099 },
      { from: 10_100, to: 20_099 },
      { from: 10_100, to: 20_099 },
      { from: 20_100, to: 20_200 }
    ])
  })

  it('waits a pause that doubles each time: one second, then two, then four', async () => {
    const { provider, logs } = nodeOf()
    logs
      .mockRejectedValueOnce(refused(1))
      .mockRejectedValueOnce(refused(2))
      .mockRejectedValueOnce(refused(3))
    const read = logsInChunks(provider, FILTER, SCAN)
    const triesAfter = async (ms: number) => {
      await advanceClock(ms)
      return logs.mock.calls.length
    }
    expect(await triesAfter(0)).toBe(1)
    expect(await triesAfter(999)).toBe(1)
    expect(await triesAfter(1)).toBe(2)
    expect(await triesAfter(1_999)).toBe(2)
    expect(await triesAfter(1)).toBe(3)
    expect(await triesAfter(3_999)).toBe(3)
    expect(await triesAfter(1)).toBe(6)
    await expect(read).resolves.toEqual(LOGS)
  })

  it('fails the scan with its last refusal after the fourth try, reading no later chunk', async () => {
    const { provider, logs, ranges } = nodeOf()
    const last = refused(4)
    logs
      .mockRejectedValueOnce(refused(1))
      .mockRejectedValueOnce(refused(2))
      .mockRejectedValueOnce(refused(3))
      .mockRejectedValueOnce(last)
    const read = logsInChunks(provider, FILTER, SCAN)
    await expect(pastRetryPauses(read)).rejects.toBe(last)
    expect(ranges()).toEqual(Array(4).fill({ from: 100, to: 10_099 }))
  })
})

describe('a chunk the node refuses for its rate limit', () => {
  it('fails the scan with that refusal, with no read of its own again', async () => {
    const { provider, logs, ranges } = nodeOf()
    const refusal = providerReadFailure('logs', { code: -32005, message: 'Too Many Requests' })
    logs.mockRejectedValueOnce(refusal)
    const read = logsInChunks(provider, FILTER, SCAN)
    await expect(pastRetryPauses(read)).rejects.toBe(refusal)
    expect(ranges()).toEqual([{ from: 100, to: 10_099 }])
  })
})

describe('a chunk the node answers', () => {
  it('is read once, with no pause', async () => {
    const { provider, ranges } = nodeOf()
    await expect(logsInChunks(provider, FILTER, SCAN)).resolves.toEqual(LOGS)
    expect(ranges()).toEqual([
      { from: 100, to: 10_099 },
      { from: 10_100, to: 20_099 },
      { from: 20_100, to: 20_200 }
    ])
  })
})
