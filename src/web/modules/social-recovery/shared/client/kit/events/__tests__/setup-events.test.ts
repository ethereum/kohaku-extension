/**
 * The manager's two setup events: their topics, their filters, their
 * decoding, and the scans that read them in chunks of at most ten thousand
 * blocks. The logs are encoded here from hand-written event signatures.
 */
import {
  encodeAbiParameters,
  encodeEventTopics,
  type Hex,
  pad,
  parseAbi,
  parseAbiParameters
} from 'viem'

import type {
  Address,
  BlockRange,
  FilterSpec,
  IProvider,
  RawLog
} from '@web/modules/social-recovery/sdk-interfaces'
import { providerReadFailure } from '@web/modules/social-recovery/shared/client/provider-adapter'
import {
  chunksOf,
  createSetupEvents,
  decodeSetupLog,
  logsInChunks,
  SETUP_CLEARED_TOPIC,
  SETUP_COMMITTED_TOPIC
} from '@web/modules/social-recovery/shared/client/kit/events'

const MANAGER: Address = '0x734B9Aa580d4A184Ea129E791C4C9Fb8734B3aC6'
const OTHER_CONTRACT: Address = '0x9999999999999999999999999999999999999999'
const ACCOUNT: Address = '0xabCDeF0123456789AbcdEf0123456789aBCDEF01'
const OTHER_ACCOUNT: Address = '0x2222222222222222222222222222222222222222'
const ACTION: Address = '0x6666666666666666666666666666666666666666'
const OTHER_ACTION: Address = '0x7777777777777777777777777777777777777777'
const COMMITMENT: Hex = `0x${'5a'.repeat(32)}`
const PUBLIC_METADATA: Hex = '0xc0ffee'
const PRIVATE_METADATA: Hex = '0xbeef'

const SETUP_EVENTS = parseAbi([
  'event SetupCommitted(address indexed account, address indexed action, uint64 nonce, bytes32 setupCommitment, bytes publicMetadata, bytes privateMetadata)',
  'event SetupCleared(address indexed account, address indexed action, uint64 nonce)',
  'event AttemptConsumed(address indexed account, address indexed action, uint64 indexed attemptId)'
])

const topicOf = (address: Address): Hex => pad(address.toLowerCase() as Hex)

let logIndex = 0
const rawLog = (
  topics: (Hex | Hex[] | null)[],
  data: Hex,
  blockNumber: number,
  extra: Partial<RawLog> = {}
): RawLog => {
  logIndex += 1
  return {
    address: MANAGER,
    topics: topics.filter((topic): topic is Hex => typeof topic === 'string'),
    data,
    blockNumber,
    blockHash: pad(`0x${blockNumber.toString(16)}`),
    logIndex,
    transactionHash: pad(`0x${(blockNumber * 1000 + logIndex).toString(16)}`),
    ...extra
  }
}

const committedLog = (
  {
    account = ACCOUNT,
    action = ACTION,
    nonce = 1n,
    commitment = COMMITMENT
  }: { account?: Address; action?: Address; nonce?: bigint; commitment?: Hex },
  blockNumber: number,
  extra: Partial<RawLog> = {}
): RawLog =>
  rawLog(
    encodeEventTopics({
      abi: SETUP_EVENTS,
      eventName: 'SetupCommitted',
      args: { account, action }
    }),
    encodeAbiParameters(parseAbiParameters('uint64, bytes32, bytes, bytes'), [
      nonce,
      commitment,
      PUBLIC_METADATA,
      PRIVATE_METADATA
    ]),
    blockNumber,
    extra
  )

const clearedLog = (nonce: bigint, blockNumber: number, account: Address = ACCOUNT): RawLog =>
  rawLog(
    encodeEventTopics({
      abi: SETUP_EVENTS,
      eventName: 'SetupCleared',
      args: { account, action: ACTION }
    }),
    encodeAbiParameters(parseAbiParameters('uint64'), [nonce]),
    blockNumber
  )

const chainWithLogs = (logs: RawLog[], latest = 11_829_500) => {
  const logsRead = jest.fn(
    async (_filter: FilterSpec, range: BlockRange): Promise<RawLog[]> =>
      logs.filter((log) => log.blockNumber >= range.from && log.blockNumber <= range.to)
  )
  const block = jest.fn(async () => ({
    number: latest,
    timestamp: 1_700_000_000,
    hash: pad('0x01')
  }))
  const provider: IProvider = { chainId: jest.fn(), call: jest.fn(), logs: logsRead, block }
  return { provider, logsRead, block }
}

describe('the setup event topics', () => {
  it('are the topics of the two events', () => {
    const [committed] = encodeEventTopics({ abi: SETUP_EVENTS, eventName: 'SetupCommitted' })
    const [cleared] = encodeEventTopics({ abi: SETUP_EVENTS, eventName: 'SetupCleared' })
    expect(SETUP_COMMITTED_TOPIC).toBe(committed)
    expect(SETUP_CLEARED_TOPIC).toBe(cleared)
    expect(SETUP_COMMITTED_TOPIC).toBe(
      '0xaeb15cc9c82c4d7d6df3ced95db4e99bbacbed41b3ce443a54ce68b99ac114fe'
    )
    expect(SETUP_CLEARED_TOPIC).toBe(
      '0xb8d8dfdb5d45b269a7f4e17cac990bb8661b22a107bcdc77af7333f9c9a6bea7'
    )
  })
})

describe('the chunks of a log scan', () => {
  const spans: [number, { from: number; to: number }[]][] = [
    [9_999, [{ from: 100, to: 10_098 }]],
    [10_000, [{ from: 100, to: 10_099 }]],
    [
      10_001,
      [
        { from: 100, to: 10_099 },
        { from: 10_100, to: 10_100 }
      ]
    ],
    [
      20_001,
      [
        { from: 100, to: 10_099 },
        { from: 10_100, to: 20_099 },
        { from: 20_100, to: 20_100 }
      ]
    ]
  ]
  spans.forEach(([blocks, ranges]) =>
    it(`covers ${blocks} blocks with ${ranges.length} ranges`, () => {
      expect(chunksOf(100, 100 + blocks - 1)).toEqual(ranges)
    })
  )

  it('covers a single block with one range', () => {
    expect(chunksOf(7, 7)).toEqual([{ from: 7, to: 7 }])
  })

  it('covers nothing where the first block is after the last', () => {
    expect(chunksOf(8, 7)).toEqual([])
  })
})

describe('a chunked log scan', () => {
  const filter: FilterSpec = { addresses: [MANAGER], topics: [SETUP_COMMITTED_TOPIC] }

  it('asks for each chunk in order with the filter, and keeps the chain order', async () => {
    const early = committedLog({ nonce: 1n }, 120)
    const late = committedLog({ nonce: 2n }, 10_150)
    const { provider, logsRead, block } = chainWithLogs([late, early])
    const logs = await logsInChunks(provider, filter, { from: 100, to: 10_200 })
    expect(logs).toEqual([early, late])
    expect(logsRead.mock.calls).toEqual([
      [filter, { from: 100, to: 10_099 }],
      [filter, { from: 10_100, to: 10_200 }]
    ])
    expect(block).not.toHaveBeenCalled()
  })

  it('reads the latest block once where no last block is given', async () => {
    const { provider, logsRead, block } = chainWithLogs([], 25_000)
    await logsInChunks(provider, filter, { from: 1 })
    expect(block).toHaveBeenCalledTimes(1)
    expect(block).toHaveBeenCalledWith('latest')
    expect(logsRead.mock.calls.map(([, range]) => range)).toEqual([
      { from: 1, to: 10_000 },
      { from: 10_001, to: 20_000 },
      { from: 20_001, to: 25_000 }
    ])
  })

  it('asks for nothing where the first block is past the latest', async () => {
    const { provider, logsRead } = chainWithLogs([], 99)
    await expect(logsInChunks(provider, filter, { from: 100 })).resolves.toEqual([])
    expect(logsRead).not.toHaveBeenCalled()
  })

  it('rejects where a chunk read fails', async () => {
    const failure = providerReadFailure('logs', new Error('range too wide'))
    const { provider, logsRead } = chainWithLogs([])
    logsRead.mockRejectedValueOnce(failure)
    await expect(logsInChunks(provider, filter, { from: 1, to: 5 })).rejects.toBe(failure)
  })
})

describe('decoding one setup log', () => {
  it('decodes a commit with its position', () => {
    const log = committedLog({ nonce: 3n }, 11_829_400)
    expect(decodeSetupLog(log)).toEqual({
      kind: 'setup-committed',
      account: ACCOUNT,
      action: ACTION,
      nonce: 3n,
      setupCommitment: COMMITMENT,
      publicMetadata: PUBLIC_METADATA,
      privateMetadata: PRIVATE_METADATA,
      at: {
        blockNumber: 11_829_400,
        blockHash: log.blockHash,
        logIndex: log.logIndex,
        transactionHash: log.transactionHash,
        removed: false
      }
    })
  })

  it('decodes a clear', () => {
    const log = clearedLog(4n, 11_829_401)
    expect(decodeSetupLog(log)).toMatchObject({
      kind: 'setup-cleared',
      account: ACCOUNT,
      action: ACTION,
      nonce: 4n,
      at: { blockNumber: 11_829_401, removed: false }
    })
  })

  it('carries a removed flag in the position', () => {
    expect(decodeSetupLog({ ...clearedLog(5n, 12), removed: true })).toMatchObject({
      at: { removed: true }
    })
  })

  const good = committedLog({}, 10)
  const ignored: [string, RawLog][] = [
    [
      'another event',
      rawLog(
        encodeEventTopics({
          abi: SETUP_EVENTS,
          eventName: 'AttemptConsumed',
          args: { account: ACCOUNT, action: ACTION, attemptId: 1n }
        }),
        '0x',
        10
      )
    ],
    ['an unknown topic', { ...good, topics: [pad('0x1234'), ...good.topics.slice(1)] }],
    ['two topics', { ...good, topics: good.topics.slice(0, 2) }],
    ['four topics', { ...good, topics: [...good.topics, pad('0x01')] }],
    ['no topic', { ...good, topics: [] }],
    ['empty data', { ...good, data: '0x' }],
    ['data cut short', { ...good, data: `0x${good.data.slice(2, 66)}` }],
    ['a clear with no data', { ...clearedLog(1n, 10), data: '0x' }]
  ]
  ignored.forEach(([label, log]) =>
    it(`answers undefined for ${label}, never throwing`, () => {
      expect(() => decodeSetupLog(log)).not.toThrow()
      expect(decodeSetupLog(log)).toBeUndefined()
    })
  )
})

describe('the setup events of a manager', () => {
  it('filters both events of an account at any action', () => {
    const { provider } = chainWithLogs([])
    expect(createSetupEvents(provider, MANAGER).setupFilter(ACCOUNT)).toEqual({
      addresses: [MANAGER],
      topics: [[SETUP_COMMITTED_TOPIC, SETUP_CLEARED_TOPIC], topicOf(ACCOUNT)]
    })
  })

  it('filters the commits of an account at one action', () => {
    const { provider } = chainWithLogs([])
    expect(createSetupEvents(provider, MANAGER).commitFilter(ACCOUNT, ACTION)).toEqual({
      addresses: [MANAGER],
      topics: [SETUP_COMMITTED_TOPIC, topicOf(ACCOUNT), topicOf(ACTION)]
    })
  })

  it("reads an account's commits and clears at any action, keeping only the manager's own", async () => {
    const first = committedLog({ nonce: 1n }, 11_829_400)
    const atOtherAction = committedLog({ action: OTHER_ACTION, nonce: 1n }, 11_829_401)
    const cleared = clearedLog(1n, 11_829_402)
    const { provider, logsRead } = chainWithLogs([
      first,
      atOtherAction,
      cleared,
      committedLog({ nonce: 2n }, 11_829_403, { address: OTHER_CONTRACT }),
      committedLog({ nonce: 2n }, 11_829_403, { removed: true }),
      committedLog({ account: OTHER_ACCOUNT }, 11_829_404),
      { ...committedLog({}, 11_829_405), data: '0x' },
      { ...committedLog({}, 11_829_406), topics: committedLog({}, 0).topics.slice(0, 2) },
      { ...committedLog({}, 11_829_407), address: MANAGER.toLowerCase() as Address }
    ])
    const logs = await createSetupEvents(provider, MANAGER).setupLogsOf(ACCOUNT, {
      from: 11_829_364,
      to: 11_829_500
    })
    expect(logs.map((log) => [log.kind, log.action, log.nonce, log.at.blockNumber])).toEqual([
      ['setup-committed', ACTION, 1n, 11_829_400],
      ['setup-committed', OTHER_ACTION, 1n, 11_829_401],
      ['setup-cleared', ACTION, 1n, 11_829_402],
      ['setup-committed', ACTION, 1n, 11_829_407]
    ])
    expect(logsRead).toHaveBeenCalledWith(
      {
        addresses: [MANAGER],
        topics: [[SETUP_COMMITTED_TOPIC, SETUP_CLEARED_TOPIC], topicOf(ACCOUNT)]
      },
      { from: 11_829_364, to: 11_829_500 }
    )
  })

  it('drops a log whose address is hex but no address, and answers the other logs', async () => {
    const { provider } = chainWithLogs([
      committedLog({ nonce: 1n }, 11_829_400),
      committedLog({ nonce: 2n }, 11_829_401, { address: `0x${'ab'.repeat(10)}` as Address }),
      clearedLog(1n, 11_829_402)
    ])
    const logs = await createSetupEvents(provider, MANAGER).setupLogsOf(ACCOUNT, {
      from: 11_829_364,
      to: 11_829_500
    })
    expect(logs.map((log) => [log.kind, log.nonce, log.at.blockNumber])).toEqual([
      ['setup-committed', 1n, 11_829_400],
      ['setup-cleared', 1n, 11_829_402]
    ])
  })

  it('finds the commit with the nonce and the commitment, in any case', async () => {
    const wanted = committedLog({ nonce: 2n }, 11_829_410)
    const { provider, logsRead } = chainWithLogs([
      committedLog({ nonce: 1n }, 11_829_400),
      committedLog({ nonce: 2n, commitment: `0x${'6b'.repeat(32)}` }, 11_829_405),
      wanted
    ])
    const found = await createSetupEvents(provider, MANAGER).commitOf(
      {
        account: ACCOUNT,
        action: ACTION,
        nonce: 2n,
        setupCommitment: `0x${'5A'.repeat(32)}`
      },
      { from: 11_829_390 }
    )
    expect(found).toMatchObject({
      kind: 'setup-committed',
      nonce: 2n,
      setupCommitment: COMMITMENT,
      at: { blockNumber: 11_829_410, transactionHash: wanted.transactionHash }
    })
    expect(logsRead).toHaveBeenCalledWith(
      {
        addresses: [MANAGER],
        topics: [SETUP_COMMITTED_TOPIC, topicOf(ACCOUNT), topicOf(ACTION)]
      },
      { from: 11_829_390, to: 11_829_500 }
    )
  })

  const misses: [string, { nonce: bigint; setupCommitment: Hex }][] = [
    ['a wrong nonce', { nonce: 3n, setupCommitment: COMMITMENT }],
    ['a wrong commitment', { nonce: 2n, setupCommitment: `0x${'6b'.repeat(32)}` }]
  ]
  misses.forEach(([label, query]) =>
    it(`finds no commit for ${label}`, async () => {
      const { provider } = chainWithLogs([committedLog({ nonce: 2n }, 11_829_410)])
      await expect(
        createSetupEvents(provider, MANAGER).commitOf(
          { account: ACCOUNT, action: ACTION, ...query },
          { from: 11_829_390 }
        )
      ).resolves.toBeUndefined()
    })
  )

  it('finds no commit in a removed log or at another action', async () => {
    const { provider } = chainWithLogs([
      committedLog({ nonce: 2n }, 11_829_410, { removed: true }),
      committedLog({ nonce: 2n, action: OTHER_ACTION }, 11_829_411)
    ])
    await expect(
      createSetupEvents(provider, MANAGER).commitOf(
        { account: ACCOUNT, action: ACTION, nonce: 2n, setupCommitment: COMMITMENT },
        { from: 11_829_390 }
      )
    ).resolves.toBeUndefined()
  })
})
