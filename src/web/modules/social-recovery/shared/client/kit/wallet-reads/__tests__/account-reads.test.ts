/**
 * The key a recovery would remove from a listed account with no code, and the
 * fit check, read over a fake code read and a fake action: the removed key is
 * taken from the creation privileges at the pinned block, with no chain read
 * of a key; the fit check reads the deployed code, or compares the
 * implementation to be with the action's.
 */
import { getAddress, type Hex, pad, zeroHash } from 'viem'

import { ERC_4337_ENTRYPOINT } from '@ambire-common/consts/deploy'
import type { Address, BlockTag } from '@web/modules/social-recovery/sdk-interfaces'
import { createKitWalletReads } from '@web/modules/social-recovery/shared/client/kit/wallet-reads'

const ACCOUNT: Address = '0xabCDeF0123456789AbcdEf0123456789aBCDEF01'
const KEY_A: Address = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa'
const KEY_B: Address = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB'
const KEY_C: Address = '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC'
const ENTRY_POINT = getAddress(ERC_4337_ENTRYPOINT)
const IMPLEMENTATION: Address = '0x0F2AA7bcda3d9D210dF69a394b6965CB2566c828'
const OTHER_IMPLEMENTATION: Address = '0x5555555555555555555555555555555555555555'
const ACCOUNT_CODE: Hex = '0x6080604052'
const HOLDS: Hex = pad('0x01')
const PINNED = 100
const CREATION = { factoryAddr: OTHER_IMPLEMENTATION, bytecode: '0x60', salt: zeroHash }

const worldOf = ({
  addr = ACCOUNT,
  code = '0x',
  initialPrivileges = [],
  associatedKeys = [],
  creation = CREATION,
  accountImplementation,
  supportsAccount = true
}: {
  addr?: string
  code?: Hex
  initialPrivileges?: [string, string][]
  associatedKeys?: string[]
  creation?: typeof CREATION | null
  accountImplementation?: Address
  supportsAccount?: boolean
}) => {
  const codeRead = { code: jest.fn<Promise<Hex>, [Address, BlockTag?]>(async () => code) }
  const action = {
    isAuthority: jest.fn<Promise<boolean>, [Address, Address]>(async () => true),
    supportsAccount: jest.fn<Promise<boolean>, [Address]>(async () => supportsAccount),
    ambireImplementation: jest.fn(async () => IMPLEMENTATION)
  }
  const provider = {
    chainId: jest.fn(async () => 11155111),
    call: jest.fn(async (): Promise<Hex> => zeroHash),
    logs: jest.fn(async () => []),
    block: jest.fn(async () => ({ number: PINNED, timestamp: 0, hash: zeroHash }))
  }
  const events = { accountFilter: jest.fn(), fetch: jest.fn(async () => []) }
  const reads = createKitWalletReads({
    account: { addr, associatedKeys, initialPrivileges, creation },
    accountImplementation,
    action,
    manager: { stateOf: jest.fn() },
    moduleReads: { verify: jest.fn() },
    codeRead,
    provider,
    descriptor: { manager: OTHER_IMPLEMENTATION, action: OTHER_IMPLEMENTATION, deployedAt: 0 },
    events,
    transactionRead: jest.fn(async () => null)
  })
  return { reads, codeRead, action, provider, events }
}

describe('the removed key of an account with no code', () => {
  it('is the one key whose creation privilege is not zero, with no authority read and no scan', async () => {
    const { reads, action, codeRead, provider, events } = worldOf({
      initialPrivileges: [
        [KEY_A, HOLDS],
        [KEY_B, zeroHash]
      ],
      associatedKeys: [KEY_C]
    })
    await expect(reads.removedKey()).resolves.toEqual({ kind: 'named', key: KEY_A })
    expect(action.isAuthority).not.toHaveBeenCalled()
    expect(codeRead.code.mock.calls).toEqual([[ACCOUNT, PINNED]])
    expect(provider.logs).not.toHaveBeenCalled()
    expect(events.fetch).not.toHaveBeenCalled()
  })

  it('names none where every creation privilege is zero', async () => {
    const { reads } = worldOf({ initialPrivileges: [[KEY_A, zeroHash]] })
    await expect(reads.removedKey()).resolves.toEqual({
      kind: 'unavailable',
      cause: 'no-key-entry'
    })
  })

  it('names none where several keys hold a creation privilege', async () => {
    const { reads } = worldOf({
      initialPrivileges: [
        [KEY_A, HOLDS],
        [KEY_B, '0x02']
      ]
    })
    await expect(reads.removedKey()).resolves.toEqual({
      kind: 'unavailable',
      cause: 'several-key-entries'
    })
  })

  it('counts one key written in two cases once', async () => {
    const { reads } = worldOf({
      initialPrivileges: [
        [KEY_A, HOLDS],
        [KEY_A.toLowerCase(), HOLDS]
      ]
    })
    await expect(reads.removedKey()).resolves.toEqual({ kind: 'named', key: KEY_A })
  })

  it('never counts the entry point', async () => {
    const { reads } = worldOf({
      initialPrivileges: [
        [KEY_A, HOLDS],
        [ENTRY_POINT.toLowerCase(), HOLDS]
      ]
    })
    await expect(reads.removedKey()).resolves.toEqual({ kind: 'named', key: KEY_A })
  })
})

describe('the fit check', () => {
  ;[true, false].forEach((supportsAccount) =>
    it(`reads supportsAccount for an account with code (${supportsAccount})`, async () => {
      const { reads, action } = worldOf({ code: ACCOUNT_CODE, supportsAccount })
      await expect(reads.fitCheck(OTHER_IMPLEMENTATION)).resolves.toEqual({
        basis: 'deployed-code',
        fits: supportsAccount
      })
      expect(action.supportsAccount).toHaveBeenCalledWith(ACCOUNT)
      expect(action.ambireImplementation).not.toHaveBeenCalled()
    })
  )

  it("compares the code to be with the action's implementation, in any case", async () => {
    const lower = IMPLEMENTATION.toLowerCase() as Address
    const { reads, action } = worldOf({})
    await expect(reads.fitCheck(lower)).resolves.toEqual({
      basis: 'code-to-be',
      implementation: lower,
      fits: true
    })
    expect(action.supportsAccount).not.toHaveBeenCalled()
  })

  it('does not fit code to be of another implementation', async () => {
    const { reads } = worldOf({})
    await expect(reads.fitCheck(OTHER_IMPLEMENTATION)).resolves.toEqual({
      basis: 'code-to-be',
      implementation: OTHER_IMPLEMENTATION,
      fits: false
    })
  })

  it('takes the configured implementation where none is given', async () => {
    const { reads } = worldOf({ accountImplementation: IMPLEMENTATION })
    await expect(reads.fitCheck()).resolves.toEqual({
      basis: 'code-to-be',
      implementation: IMPLEMENTATION,
      fits: true
    })
  })

  it('takes the given implementation over the configured one', async () => {
    const { reads } = worldOf({ accountImplementation: IMPLEMENTATION })
    await expect(reads.fitCheck(OTHER_IMPLEMENTATION)).resolves.toEqual({
      basis: 'code-to-be',
      implementation: OTHER_IMPLEMENTATION,
      fits: false
    })
  })

  it('has no basis with no code and no implementation', async () => {
    const { reads, action } = worldOf({})
    await expect(reads.fitCheck()).resolves.toEqual({ basis: 'no-code', fits: false })
    expect(action.ambireImplementation).not.toHaveBeenCalled()
  })
})

describe('an account record with a malformed address', () => {
  it('rejects both reads', async () => {
    const { reads, codeRead } = worldOf({ addr: '0x1234', initialPrivileges: [[KEY_A, HOLDS]] })
    await expect(reads.removedKey()).rejects.toThrow(/0x1234/)
    await expect(reads.fitCheck(IMPLEMENTATION)).rejects.toThrow(/0x1234/)
    expect(codeRead.code).not.toHaveBeenCalled()
  })
})
