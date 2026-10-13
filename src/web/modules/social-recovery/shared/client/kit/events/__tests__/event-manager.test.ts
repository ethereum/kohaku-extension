/**
 * The events feed of one account's deployment: its two filters, its chunked
 * fetch, and the decoding of the manager's five events and the account's
 * privilege event by the emitting address. The logs are encoded here from
 * hand-written event signatures.
 */
import {
  encodeAbiParameters,
  encodeEventTopics,
  type Hex,
  pad,
  parseAbi,
  parseAbiParameters,
  zeroAddress
} from 'viem'

import type {
  Address,
  BlockRange,
  FilterSpec,
  IProvider,
  RawLog
} from '@web/modules/social-recovery/sdk-interfaces'
import {
  ATTEMPT_CANCELLED_TOPIC,
  ATTEMPT_CONSUMED_TOPIC,
  ATTEMPT_STARTED_TOPIC,
  createKitEventManager,
  PRIVILEGE_CHANGED_TOPIC,
  SETUP_CLEARED_TOPIC,
  SETUP_COMMITTED_TOPIC
} from '@web/modules/social-recovery/shared/client/kit/events'

const MANAGER: Address = '0x734B9Aa580d4A184Ea129E791C4C9Fb8734B3aC6'
const ACCOUNT: Address = '0xabCDeF0123456789AbcdEf0123456789aBCDEF01'
const ACTION: Address = '0x6666666666666666666666666666666666666666'
const OTHER_CONTRACT: Address = '0x9999999999999999999999999999999999999999'
const METHOD: Address = '0x4444444444444444444444444444444444444444'
const KEY: Address = '0x5555555555555555555555555555555555555555'
const TOKEN: Address = '0x3333333333333333333333333333333333333333'
const PAYEE: Address = '0x1111111111111111111111111111111111111111'
const SUBMITTER: Address = '0x8888888888888888888888888888888888888888'
const BODY: Hex = '0xb0d1'
const PAYLOAD: Hex = '0xfeed'
const COMMITMENT: Hex = `0x${'5a'.repeat(32)}`
const PRIV: Hex = `0x${'00'.repeat(31)}01`

const EVENTS = parseAbi([
  'event SetupCommitted(address indexed account, address indexed action, uint64 nonce, bytes32 setupCommitment, bytes publicMetadata, bytes privateMetadata)',
  'event SetupCleared(address indexed account, address indexed action, uint64 nonce)',
  'event AttemptStarted(address indexed account, address indexed action, uint64 attemptId, uint64 setupNonce, bytes setupBody, uint256[] usedPlaces, address[] usedMethods, bytes payload, (address token, uint256 amount, address payee) order, uint48 consumableAfter)',
  'event AttemptCancelled(address indexed account, address indexed action, uint64 attemptId, address canceller, address stoppedMethod, uint64 setupNonce, uint256[] usedPlaces)',
  'event AttemptConsumed(address indexed account, address indexed action, uint64 attemptId)',
  'event LogPrivilegeChanged(address indexed addr, bytes32 priv)',
  'event Paused(address account)'
])

const managerTopics = (
  eventName:
    | 'SetupCommitted'
    | 'SetupCleared'
    | 'AttemptStarted'
    | 'AttemptCancelled'
    | 'AttemptConsumed'
): Hex[] =>
  encodeEventTopics({ abi: EVENTS, eventName, args: { account: ACCOUNT, action: ACTION } }).filter(
    (topic): topic is Hex => typeof topic === 'string'
  )

let logIndex = 0
const rawLog = (
  topics: Hex[],
  data: Hex,
  blockNumber: number,
  extra: Partial<RawLog> = {}
): RawLog => {
  logIndex += 1
  return {
    address: MANAGER,
    topics,
    data,
    blockNumber,
    blockHash: pad(`0x${blockNumber.toString(16)}`),
    logIndex,
    transactionHash: pad(`0x${(blockNumber * 1000 + logIndex).toString(16)}`),
    ...extra
  }
}

const committedLog = (blockNumber: number, extra: Partial<RawLog> = {}): RawLog =>
  rawLog(
    managerTopics('SetupCommitted'),
    encodeAbiParameters(parseAbiParameters('uint64, bytes32, bytes, bytes'), [
      1n,
      COMMITMENT,
      '0xc0ffee',
      '0xbeef'
    ]),
    blockNumber,
    extra
  )

const clearedLog = (blockNumber: number): RawLog =>
  rawLog(
    managerTopics('SetupCleared'),
    encodeAbiParameters(parseAbiParameters('uint64'), [2n]),
    blockNumber
  )

const startedLog = (blockNumber: number): RawLog =>
  rawLog(
    managerTopics('AttemptStarted'),
    encodeAbiParameters(
      parseAbiParameters(
        'uint64, uint64, bytes, uint256[], address[], bytes, (address token, uint256 amount, address payee), uint48'
      ),
      [
        7n,
        3n,
        BODY,
        [0n, 2n],
        [METHOD, KEY],
        PAYLOAD,
        { token: TOKEN, amount: 25n, payee: PAYEE },
        1_800_086_400
      ]
    ),
    blockNumber
  )

const cancelledLog = (
  blockNumber: number,
  {
    canceller,
    stoppedMethod = zeroAddress,
    usedPlaces = []
  }: { canceller: Address; stoppedMethod?: Address; usedPlaces?: bigint[] }
): RawLog =>
  rawLog(
    managerTopics('AttemptCancelled'),
    encodeAbiParameters(parseAbiParameters('uint64, address, address, uint64, uint256[]'), [
      7n,
      canceller,
      stoppedMethod,
      3n,
      usedPlaces
    ]),
    blockNumber
  )

const consumedLog = (blockNumber: number): RawLog =>
  rawLog(
    managerTopics('AttemptConsumed'),
    encodeAbiParameters(parseAbiParameters('uint64'), [7n]),
    blockNumber
  )

const privilegeLog = (blockNumber: number, extra: Partial<RawLog> = {}): RawLog =>
  rawLog(
    encodeEventTopics({
      abi: EVENTS,
      eventName: 'LogPrivilegeChanged',
      args: { addr: KEY }
    }).filter((topic): topic is Hex => typeof topic === 'string'),
    encodeAbiParameters(parseAbiParameters('bytes32'), [PRIV]),
    blockNumber,
    { address: ACCOUNT, ...extra }
  )

const nodeWithLogs = (logs: RawLog[], chunkWidth?: number) => {
  const logsRead = jest.fn(
    async (_filter: FilterSpec, range: BlockRange): Promise<RawLog[]> =>
      logs.filter((log) => log.blockNumber >= range.from && log.blockNumber <= range.to)
  )
  const block = jest.fn()
  const provider: IProvider = { chainId: jest.fn(), call: jest.fn(), logs: logsRead, block }
  const events = createKitEventManager({
    provider,
    descriptor: { manager: MANAGER, action: ACTION },
    account: ACCOUNT,
    chunkWidth
  })
  return { events, logsRead, block }
}

const topicOf = (address: Address): Hex => pad(address.toLowerCase() as Hex)

describe('the filters of the events feed', () => {
  it("filters the manager's five events of the account at its action", () => {
    const { events } = nodeWithLogs([])
    expect(events.accountFilter()).toEqual({
      addresses: [MANAGER],
      topics: [
        [
          SETUP_COMMITTED_TOPIC,
          SETUP_CLEARED_TOPIC,
          ATTEMPT_STARTED_TOPIC,
          ATTEMPT_CANCELLED_TOPIC,
          ATTEMPT_CONSUMED_TOPIC
        ],
        topicOf(ACCOUNT),
        topicOf(ACTION)
      ]
    })
  })

  it('leaves the action open where any action is asked for', () => {
    const { events } = nodeWithLogs([])
    expect(events.accountFilter({ anyAction: true }).topics[2]).toBeNull()
  })

  it("filters the account's own privilege writes", () => {
    const { events } = nodeWithLogs([])
    expect(events.privilegeFilter()).toEqual({
      addresses: [ACCOUNT],
      topics: [PRIVILEGE_CHANGED_TOPIC]
    })
  })

  it('refuses the method filter by name', () => {
    const { events } = nodeWithLogs([])
    expect(() => events.methodFilter()).toThrow(
      expect.objectContaining({ name: 'NotServedRefusal', member: 'events.methodFilter' })
    )
  })
})

describe('a fetch of the events feed', () => {
  it('reads two chunks in order, drops a removed log and skips one that does not decode', async () => {
    const early = committedLog(120)
    const late = consumedLog(10_150)
    const { events, logsRead } = nodeWithLogs([
      early,
      committedLog(130, { removed: true }),
      { ...startedLog(140), data: '0x' },
      late
    ])
    const filter = events.accountFilter()
    const found = await events.fetch(filter, { from: 100, to: 10_200 })
    expect(found.map((notice) => [notice.kind, notice.at.blockNumber])).toEqual([
      ['setup-committed', 120],
      ['attempt-consumed', 10_150]
    ])
    expect(logsRead.mock.calls).toEqual([
      [filter, { from: 100, to: 10_099 }],
      [filter, { from: 10_100, to: 10_200 }]
    ])
  })

  it('reads in chunks of 10,000 blocks where no width is given', async () => {
    const { events, logsRead } = nodeWithLogs([])
    await events.fetch(events.accountFilter(), { from: 0, to: 25_000 })
    expect(logsRead.mock.calls.map(([, range]) => range)).toEqual([
      { from: 0, to: 9_999 },
      { from: 10_000, to: 19_999 },
      { from: 20_000, to: 25_000 }
    ])
  })

  it('reads in chunks of the width it is given', async () => {
    const { events, logsRead } = nodeWithLogs([committedLog(103)], 2)
    const found = await events.fetch(events.accountFilter(), { from: 100, to: 104 })
    expect(found.map((notice) => notice.at.blockNumber)).toEqual([103])
    expect(logsRead.mock.calls.map(([, range]) => range)).toEqual([
      { from: 100, to: 101 },
      { from: 102, to: 103 },
      { from: 104, to: 104 }
    ])
  })

  it('answers nothing and reads nothing for an empty range', async () => {
    const { events, logsRead, block } = nodeWithLogs([committedLog(120)])
    await expect(events.fetch(events.accountFilter(), { from: 121, to: 120 })).resolves.toEqual([])
    expect(logsRead).not.toHaveBeenCalled()
    expect(block).not.toHaveBeenCalled()
  })

  it('rejects where a chunk read fails', async () => {
    const failure = new Error('range too wide')
    const { events, logsRead } = nodeWithLogs([])
    logsRead.mockRejectedValueOnce(failure)
    await expect(events.fetch(events.privilegeFilter(), { from: 1, to: 5 })).rejects.toBe(failure)
  })
})

describe('decoding one log of the events feed', () => {
  const { events } = nodeWithLogs([])

  it('decodes a setup commit and a clear of the manager', () => {
    expect(events.decodeLog(committedLog(10))).toMatchObject({
      kind: 'setup-committed',
      account: ACCOUNT,
      action: ACTION,
      nonce: 1n,
      setupCommitment: COMMITMENT,
      publicMetadata: '0xc0ffee',
      privateMetadata: '0xbeef'
    })
    expect(events.decodeLog(clearedLog(11))).toMatchObject({
      kind: 'setup-cleared',
      account: ACCOUNT,
      action: ACTION,
      nonce: 2n
    })
  })

  it('decodes an attempt start with every field of the event', () => {
    const log = startedLog(12)
    expect(events.decodeLog(log)).toEqual({
      kind: 'attempt-started',
      account: ACCOUNT,
      action: ACTION,
      attemptId: 7n,
      setupNonce: 3n,
      setupBody: BODY,
      usedPlaces: [0n, 2n],
      usedMethods: [METHOD, KEY],
      payload: PAYLOAD,
      order: { token: TOKEN, amount: 25n, payee: PAYEE },
      consumableAfter: 1_800_086_400,
      at: {
        blockNumber: 12,
        blockHash: log.blockHash,
        logIndex: log.logIndex,
        transactionHash: log.transactionHash,
        removed: false
      }
    })
  })

  it('decodes an attempt consume', () => {
    expect(events.decodeLog(consumedLog(13))).toMatchObject({
      kind: 'attempt-consumed',
      account: ACCOUNT,
      action: ACTION,
      attemptId: 7n,
      at: { blockNumber: 13 }
    })
  })

  const cancels: [string, Parameters<typeof cancelledLog>[1], string][] = [
    ['a stopped method', { canceller: SUBMITTER, stoppedMethod: METHOD }, 'cancelByVeto'],
    [
      'a stopped method beside used places',
      { canceller: SUBMITTER, stoppedMethod: METHOD, usedPlaces: [1n] },
      'cancelByVeto'
    ],
    ['used places', { canceller: SUBMITTER, usedPlaces: [0n, 1n] }, 'cancelByProofs'],
    ['the account as the canceller', { canceller: ACCOUNT }, 'cancelByOwner'],
    ['no canceller', { canceller: zeroAddress }, 'setupWrite']
  ]
  cancels.forEach(([label, fields, cancelledBy]) =>
    it(`names a cancel with ${label} as ${cancelledBy}`, () => {
      expect(events.decodeLog(cancelledLog(14, fields))).toMatchObject({
        kind: 'attempt-cancelled',
        account: ACCOUNT,
        action: ACTION,
        attemptId: 7n,
        canceller: fields.canceller,
        vetoingMethod: fields.stoppedMethod ?? zeroAddress,
        setupNonce: 3n,
        usedPlaces: fields.usedPlaces ?? [],
        cancelledBy
      })
    })
  )

  it("decodes the account's privilege write", () => {
    expect(events.decodeLog(privilegeLog(15))).toMatchObject({
      kind: 'privilege-changed',
      account: ACCOUNT,
      addr: KEY,
      priv: PRIV
    })
  })

  const unowned: [string, RawLog][] = [
    ['a manager event emitted by another address', { ...consumedLog(16), address: OTHER_CONTRACT }],
    ['a privilege write of another address', privilegeLog(16, { address: OTHER_CONTRACT })],
    ['a privilege write emitted by the manager', privilegeLog(16, { address: MANAGER })],
    ['a manager event emitted by the account', { ...startedLog(16), address: ACCOUNT }],
    [
      'a manager log of another event',
      rawLog(
        [
          ...encodeEventTopics({ abi: EVENTS, eventName: 'Paused' }).filter(
            (topic): topic is Hex => typeof topic === 'string'
          ),
          ...managerTopics('AttemptConsumed').slice(1)
        ],
        encodeAbiParameters(parseAbiParameters('address'), [ACCOUNT]),
        16
      )
    ],
    [
      'a manager log with an unknown topic',
      { ...startedLog(16), topics: [pad('0x1234'), ...managerTopics('AttemptStarted').slice(1)] }
    ],
    [
      'an attempt start cut short',
      { ...startedLog(16), data: `0x${startedLog(16).data.slice(2, 130)}` }
    ],
    ['an address that is no address', { ...consumedLog(16), address: '0xabab' as Address }]
  ]
  unowned.forEach(([label, log]) =>
    it(`answers undefined for ${label}, never throwing`, () => {
      expect(() => events.decodeLog(log)).not.toThrow()
      expect(events.decodeLog(log)).toBeUndefined()
    })
  )
})
