/**
 * The Ambire account's privilege event: its topic, its filter, its decoding,
 * and the scan that reads an account's privilege writes in chunks. The logs
 * are encoded here from a hand-written event signature.
 */
import { encodeAbiParameters, encodeEventTopics, type Hex, pad, parseAbi, zeroHash } from 'viem'

import type {
  Address,
  BlockRange,
  FilterSpec,
  IProvider,
  RawLog
} from '@web/modules/social-recovery/sdk-interfaces'
import { providerReadFailure } from '@web/modules/social-recovery/shared/client/provider-adapter'
import {
  createPrivilegeEvents,
  decodePrivilegeLog,
  PRIVILEGE_CHANGED_TOPIC
} from '@web/modules/social-recovery/shared/client/kit/events'
import { pastRetryPauses } from '@web/modules/social-recovery/shared/client/kit/events/__fixtures__/retries'

const ACCOUNT: Address = '0xabCDeF0123456789AbcdEf0123456789aBCDEF01'
const OTHER_ACCOUNT: Address = '0x2222222222222222222222222222222222222222'
const KEY_A: Address = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa'
const KEY_B: Address = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB'
const HOLDS: Hex = pad('0x01')

const PRIVILEGE_EVENT = parseAbi([
  'event LogPrivilegeChanged(address indexed addr, bytes32 priv)',
  'event LogOther(address indexed addr, bytes32 priv)'
])

let logIndex = 0
const privilegeLog = (
  addr: Address,
  priv: Hex,
  blockNumber: number,
  extra: Partial<RawLog> = {}
): RawLog => {
  logIndex += 1
  return {
    address: ACCOUNT,
    topics: encodeEventTopics({
      abi: PRIVILEGE_EVENT,
      eventName: 'LogPrivilegeChanged',
      args: { addr }
    }) as Hex[],
    data: encodeAbiParameters([{ type: 'bytes32' }], [priv]),
    blockNumber,
    blockHash: pad(`0x${blockNumber.toString(16)}`),
    logIndex,
    transactionHash: pad(`0x${(blockNumber * 1000 + logIndex).toString(16)}`),
    ...extra
  }
}

const chainWithLogs = (logs: RawLog[]) => {
  const logsRead = jest.fn(
    async (_filter: FilterSpec, range: BlockRange): Promise<RawLog[]> =>
      logs.filter((log) => log.blockNumber >= range.from && log.blockNumber <= range.to)
  )
  const provider: IProvider = {
    chainId: jest.fn(),
    call: jest.fn(),
    logs: logsRead,
    block: jest.fn(async () => ({ number: 30_000, timestamp: 0, hash: zeroHash }))
  }
  return { provider, logsRead }
}

describe('the privilege event topic', () => {
  it('is the topic of LogPrivilegeChanged', () => {
    const [topic] = encodeEventTopics({ abi: PRIVILEGE_EVENT, eventName: 'LogPrivilegeChanged' })
    expect(PRIVILEGE_CHANGED_TOPIC).toBe(topic)
  })
})

describe('decoding one privilege log', () => {
  it('decodes the address, its new value and the position', () => {
    const log = privilegeLog(KEY_A, HOLDS, 1_234)
    expect(decodePrivilegeLog(log)).toEqual({
      kind: 'privilege-changed',
      account: ACCOUNT,
      addr: KEY_A,
      priv: HOLDS,
      at: {
        blockNumber: 1_234,
        blockHash: log.blockHash,
        logIndex: log.logIndex,
        transactionHash: log.transactionHash,
        removed: false
      }
    })
  })

  const good = privilegeLog(KEY_A, HOLDS, 10)
  const ignored: [string, RawLog][] = [
    [
      'another event',
      {
        ...good,
        topics: encodeEventTopics({
          abi: PRIVILEGE_EVENT,
          eventName: 'LogOther',
          args: { addr: KEY_A }
        }) as Hex[]
      }
    ],
    ['one topic', { ...good, topics: good.topics.slice(0, 1) }],
    ['three topics', { ...good, topics: [...good.topics, pad('0x01')] }],
    ['no topic', { ...good, topics: [] }],
    ['empty data', { ...good, data: '0x' }]
  ]
  ignored.forEach(([label, log]) =>
    it(`answers undefined for ${label}, never throwing`, () => {
      expect(() => decodePrivilegeLog(log)).not.toThrow()
      expect(decodePrivilegeLog(log)).toBeUndefined()
    })
  )
})

describe('the privilege writes of an account', () => {
  it('filters the event at the account', () => {
    const { provider } = chainWithLogs([])
    expect(createPrivilegeEvents(provider).privilegeFilter(ACCOUNT)).toEqual({
      addresses: [ACCOUNT],
      topics: [PRIVILEGE_CHANGED_TOPIC]
    })
  })

  it("keeps the account's own decoded writes in chain order, across chunks", async () => {
    const { provider, logsRead } = chainWithLogs([
      privilegeLog(KEY_A, HOLDS, 5),
      privilegeLog(KEY_B, HOLDS, 6, { address: OTHER_ACCOUNT }),
      privilegeLog(KEY_B, HOLDS, 7, { removed: true }),
      { ...privilegeLog(KEY_B, HOLDS, 8), data: '0x' },
      privilegeLog(KEY_B, HOLDS, 12_000, { address: ACCOUNT.toLowerCase() as Address }),
      privilegeLog(KEY_A, zeroHash, 25_000)
    ])
    const writes = await createPrivilegeEvents(provider).privilegeLogsOf(ACCOUNT, {
      from: 0,
      to: 25_000
    })
    expect(writes.map((write) => [write.addr, write.priv, write.at.blockNumber])).toEqual([
      [KEY_A, HOLDS, 5],
      [KEY_B, HOLDS, 12_000],
      [KEY_A, zeroHash, 25_000]
    ])
    expect(logsRead).toHaveBeenCalledTimes(3)
  })

  it('reads in chunks of the width it is given', async () => {
    const { provider, logsRead } = chainWithLogs([])
    await createPrivilegeEvents(provider, 2).privilegeLogsOf(ACCOUNT, { from: 100, to: 104 })
    expect(logsRead.mock.calls.map(([, range]) => range)).toEqual([
      { from: 100, to: 101 },
      { from: 102, to: 103 },
      { from: 104, to: 104 }
    ])
  })

  it('rejects where a chunk read fails on every try', async () => {
    jest.useFakeTimers()
    const failure = providerReadFailure('logs', new Error('range too wide'))
    const { provider, logsRead } = chainWithLogs([])
    logsRead.mockRejectedValue(failure)
    await expect(
      pastRetryPauses(createPrivilegeEvents(provider).privilegeLogsOf(ACCOUNT, { from: 0, to: 5 }))
    ).rejects.toBe(failure)
  })

  afterEach(() => {
    jest.useRealTimers()
  })
})
