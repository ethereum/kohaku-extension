/**
 * The key a recovery would remove from a deployed account the wallet holds no
 * creation record for, read over a fake provider at one pinned block: the
 * account's privilege writes are scanned in chunks from the creation block
 * stand-in to that block, each address they name is asked about with the
 * account's `privileges` view and then with the action's `isAuthority`, and
 * exactly one key that passes both is the removed key. The logs and the view
 * answers are encoded here from hand-written signatures.
 */
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  type Hex,
  pad,
  parseAbi,
  zeroHash
} from 'viem'

import type {
  Address,
  BlockHeader,
  BlockRange,
  BlockTag,
  ClientConfiguration,
  FilterSpec,
  RawLog
} from '@web/modules/social-recovery/sdk-interfaces'
import { CREATION_BLOCK_STAND_IN } from '@web/modules/social-recovery/shared/client'
import { providerReadFailure } from '@web/modules/social-recovery/shared/client/provider-adapter'
import { createKitWalletReads } from '@web/modules/social-recovery/shared/client/kit/wallet-reads'

const ACCOUNT: Address = '0xabCDeF0123456789AbcdEf0123456789aBCDEF01'
const OTHER_ACCOUNT: Address = '0x2222222222222222222222222222222222222222'
const KEY_A: Address = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa'
const KEY_B: Address = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB'
const KEY_C: Address = '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC'
const ACTION_HOLDER: Address = '0x6666666666666666666666666666666666666666'
const ENTRY_POINT: Address = '0x0000000071727De22E5E9d8BAf0edAc6f37da032'
const IMPLEMENTATION: Address = '0x0F2AA7bcda3d9D210dF69a394b6965CB2566c828'
const ACCOUNT_CODE: Hex = '0x6080604052'
const HOLDS: Hex = pad('0x01')

const PRIVILEGE_EVENT = parseAbi(['event LogPrivilegeChanged(address indexed addr, bytes32 priv)'])
const PRIVILEGES_VIEW = parseAbi(['function privileges(address) view returns (bytes32)'])
const [PRIVILEGE_TOPIC] = encodeEventTopics({
  abi: PRIVILEGE_EVENT,
  eventName: 'LogPrivilegeChanged'
})

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

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/**
 * A deployed account with no creation record. The fake node answers every log
 * of the range whatever the filter, so the read's own filtering shows.
 */
const worldOf = ({
  head = 100,
  code = ACCOUNT_CODE,
  logs = [],
  holders = [],
  authorities = [],
  associatedKeys = [],
  knownKeys,
  blockTags
}: {
  head?: number
  code?: Hex
  logs?: RawLog[]
  holders?: Address[]
  authorities?: Address[]
  associatedKeys?: string[]
  knownKeys?: Address[]
  blockTags?: ClientConfiguration['blockTags']
}) => {
  const block = jest.fn<Promise<BlockHeader>, [BlockTag]>(async () => ({
    number: head,
    timestamp: 1_700_000_000,
    hash: pad('0x01')
  }))
  const logsRead = jest.fn(
    async (_filter: FilterSpec, range: BlockRange): Promise<RawLog[]> =>
      logs.filter((log) => log.blockNumber >= range.from && log.blockNumber <= range.to)
  )
  const call = jest.fn<Promise<Hex>, [Address, Hex, Address | undefined, BlockTag]>(
    async (...[, data]) => {
      const {
        args: [key]
      } = decodeFunctionData({ abi: PRIVILEGES_VIEW, data })
      return holders.some((holder) => same(holder, key)) ? HOLDS : zeroHash
    }
  )
  const provider = { chainId: jest.fn(async () => 11155111), call, logs: logsRead, block }
  const codeRead = { code: jest.fn<Promise<Hex>, [Address, BlockTag?]>(async () => code) }
  const action = {
    isAuthority: jest.fn<Promise<boolean>, [Address, Address, BlockTag?]>(async (...[, key]) =>
      authorities.some((authority) => same(authority, key))
    ),
    supportsAccount: jest.fn<Promise<boolean>, [Address]>(async () => true),
    ambireImplementation: jest.fn(async () => IMPLEMENTATION)
  }
  const reads = createKitWalletReads({
    account: { addr: ACCOUNT, associatedKeys, initialPrivileges: [], creation: null },
    knownKeys,
    action,
    moduleReads: { verify: jest.fn() },
    codeRead,
    provider,
    blockTags
  })
  const askedPrivileges = () =>
    call.mock.calls.map(([, data]) => decodeFunctionData({ abi: PRIVILEGES_VIEW, data }).args[0])
  return { reads, block, logsRead, call, codeRead, action, askedPrivileges }
}

describe('the privilege writes scan of an account with no creation record', () => {
  it('reads the chunks from the stand-in block to the pinned head with the account filter', async () => {
    const { reads, block, logsRead } = worldOf({ head: 25_000 })
    await reads.removedKey()
    expect(block.mock.calls).toEqual([['latest']])
    expect(logsRead.mock.calls).toEqual(
      [
        { from: CREATION_BLOCK_STAND_IN, to: 9_999 },
        { from: 10_000, to: 19_999 },
        { from: 20_000, to: 25_000 }
      ].map((range) => [{ addresses: [ACCOUNT], topics: [PRIVILEGE_TOPIC] }, range])
    )
  })

  it('pins every read at the block of the configured read tag', async () => {
    const { reads, block, logsRead, call, codeRead, action } = worldOf({
      head: 4_321,
      logs: [privilegeLog(KEY_A, HOLDS, 40)],
      holders: [KEY_A],
      authorities: [KEY_A],
      blockTags: { read: 'finalized', watch: 'finalized' }
    })
    await expect(reads.removedKey()).resolves.toEqual({ kind: 'named', key: KEY_A })
    expect(block.mock.calls).toEqual([['finalized']])
    expect(codeRead.code.mock.calls).toEqual([[ACCOUNT, 4_321]])
    expect(logsRead.mock.calls.map(([, range]) => range.to)).toEqual([4_321])
    expect(call.mock.calls.map(([to, , , at]) => [to, at])).toEqual([[ACCOUNT, 4_321]])
    expect(action.isAuthority.mock.calls).toEqual([[ACCOUNT, KEY_A, 4_321]])
  })
})

describe('the removed key of a deployed account with no creation record', () => {
  it('names the one signer its privilege writes name', async () => {
    const { reads } = worldOf({
      logs: [privilegeLog(KEY_A, HOLDS, 10)],
      holders: [KEY_A],
      authorities: [KEY_A]
    })
    await expect(reads.removedKey()).resolves.toEqual({ kind: 'named', key: KEY_A })
  })

  it('excludes a key whose privilege dropped to zero, without asking the action about it', async () => {
    const { reads, action } = worldOf({
      logs: [
        privilegeLog(KEY_A, HOLDS, 10),
        privilegeLog(KEY_B, HOLDS, 11),
        privilegeLog(KEY_B, zeroHash, 12)
      ],
      holders: [KEY_A],
      authorities: [KEY_A, KEY_B]
    })
    await expect(reads.removedKey()).resolves.toEqual({ kind: 'named', key: KEY_A })
    expect(action.isAuthority.mock.calls.map(([, key]) => key)).toEqual([KEY_A])
  })

  it('excludes a holder the action does not count as a signer', async () => {
    const { reads } = worldOf({
      logs: [privilegeLog(KEY_A, HOLDS, 10), privilegeLog(ACTION_HOLDER, HOLDS, 11)],
      holders: [KEY_A, ACTION_HOLDER],
      authorities: [KEY_A]
    })
    await expect(reads.removedKey()).resolves.toEqual({ kind: 'named', key: KEY_A })
  })

  it('counts only the logs the account emitted', async () => {
    const { reads, askedPrivileges } = worldOf({
      logs: [
        privilegeLog(KEY_A, HOLDS, 10),
        privilegeLog(KEY_C, HOLDS, 11, { address: OTHER_ACCOUNT })
      ],
      holders: [KEY_A, KEY_C],
      authorities: [KEY_A, KEY_C]
    })
    await expect(reads.removedKey()).resolves.toEqual({ kind: 'named', key: KEY_A })
    expect(askedPrivileges()).toEqual([KEY_A])
  })

  it('drops a log a reorg removed', async () => {
    const { reads, askedPrivileges } = worldOf({
      logs: [privilegeLog(KEY_A, HOLDS, 10), privilegeLog(KEY_C, HOLDS, 11, { removed: true })],
      holders: [KEY_A, KEY_C],
      authorities: [KEY_A, KEY_C]
    })
    await expect(reads.removedKey()).resolves.toEqual({ kind: 'named', key: KEY_A })
    expect(askedPrivileges()).toEqual([KEY_A])
  })

  it('never asks about the entry point', async () => {
    const { reads, askedPrivileges } = worldOf({
      logs: [privilegeLog(ENTRY_POINT, HOLDS, 10), privilegeLog(KEY_A, HOLDS, 11)],
      holders: [KEY_A, ENTRY_POINT],
      authorities: [KEY_A, ENTRY_POINT]
    })
    await expect(reads.removedKey()).resolves.toEqual({ kind: 'named', key: KEY_A })
    expect(askedPrivileges()).toEqual([KEY_A])
  })

  it('asks once about a key several writes name', async () => {
    const { reads, askedPrivileges } = worldOf({
      logs: [privilegeLog(KEY_A, pad('0x02'), 10), privilegeLog(KEY_A, HOLDS, 20)],
      holders: [KEY_A],
      authorities: [KEY_A]
    })
    await expect(reads.removedKey()).resolves.toEqual({ kind: 'named', key: KEY_A })
    expect(askedPrivileges()).toEqual([KEY_A])
  })

  it('refuses to name a key where several signers remain', async () => {
    const { reads } = worldOf({
      logs: [privilegeLog(KEY_A, HOLDS, 10), privilegeLog(KEY_B, HOLDS, 10_500)],
      head: 12_000,
      holders: [KEY_A, KEY_B],
      authorities: [KEY_A, KEY_B]
    })
    await expect(reads.removedKey()).resolves.toEqual({
      kind: 'unavailable',
      cause: 'several-key-entries'
    })
  })

  it('finds a key no write names where the wallet knows it', async () => {
    const { reads } = worldOf({ knownKeys: [KEY_B], holders: [KEY_B], authorities: [KEY_B] })
    await expect(reads.removedKey()).resolves.toEqual({ kind: 'named', key: KEY_B })
  })

  it('names no key where no write names one and the wallet knows none', async () => {
    const { reads, call } = worldOf({ holders: [KEY_A], authorities: [KEY_A] })
    await expect(reads.removedKey()).resolves.toEqual({
      kind: 'unavailable',
      cause: 'no-key-entry'
    })
    expect(call).not.toHaveBeenCalled()
  })
})

describe('the removed key of an account with no creation record and no code', () => {
  it('is unavailable for want of a creation record, with no scan and no key read', async () => {
    const { reads, logsRead, call, action } = worldOf({
      code: '0x',
      logs: [privilegeLog(KEY_A, HOLDS, 10)],
      holders: [KEY_A],
      authorities: [KEY_A]
    })
    await expect(reads.removedKey()).resolves.toEqual({
      kind: 'unavailable',
      cause: 'no-creation-record'
    })
    expect(logsRead).not.toHaveBeenCalled()
    expect(call).not.toHaveBeenCalled()
    expect(action.isAuthority).not.toHaveBeenCalled()
  })
})

describe('a failed read of an account with no creation record', () => {
  const failures: [string, (world: ReturnType<typeof worldOf>, failure: Error) => void][] = [
    ['the pinned block', ({ block }, failure) => block.mockRejectedValueOnce(failure)],
    ['the code', ({ codeRead }, failure) => codeRead.code.mockRejectedValueOnce(failure)],
    ['a log chunk', ({ logsRead }, failure) => logsRead.mockRejectedValueOnce(failure)],
    ['a privileges view', ({ call }, failure) => call.mockRejectedValueOnce(failure)],
    ['an authority', ({ action }, failure) => action.isAuthority.mockRejectedValueOnce(failure)]
  ]
  failures.forEach(([label, fail]) =>
    it(`rejects where ${label} read fails, never answering a refusal`, async () => {
      const failure = providerReadFailure('call', new Error('timeout'))
      const world = worldOf({
        logs: [privilegeLog(KEY_A, HOLDS, 10)],
        holders: [KEY_A],
        authorities: [KEY_A]
      })
      fail(world, failure)
      await expect(world.reads.removedKey()).rejects.toBe(failure)
    })
  )
})
