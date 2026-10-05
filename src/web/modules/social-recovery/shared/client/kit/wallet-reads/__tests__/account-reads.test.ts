/**
 * The key a recovery would remove and the fit check, read over a fake code
 * read and a fake action: the keys the wallet knows are asked about with
 * `isAuthority` where the account has code and taken from the creation
 * privileges where it has none; the fit check reads the deployed code, or
 * compares the implementation to be with the action's.
 */
import { type Hex, pad, zeroHash } from 'viem'

import type { Address, BlockTag } from '@web/modules/social-recovery/sdk-interfaces'
import { providerReadFailure } from '@web/modules/social-recovery/shared/client/provider-adapter'
import { createKitWalletReads } from '@web/modules/social-recovery/shared/client/kit/wallet-reads'

const ACCOUNT: Address = '0xabCDeF0123456789AbcdEf0123456789aBCDEF01'
const KEY_A: Address = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa'
const KEY_B: Address = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB'
const KEY_C: Address = '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC'
const ENTRY_POINT: Address = '0x0000000071727De22E5E9d8BAf0edAc6f37da032'
const IMPLEMENTATION: Address = '0x0F2AA7bcda3d9D210dF69a394b6965CB2566c828'
const OTHER_IMPLEMENTATION: Address = '0x5555555555555555555555555555555555555555'
const ACCOUNT_CODE: Hex = '0x6080604052'
const HOLDS: Hex = pad('0x01')
const CREATION = { factoryAddr: OTHER_IMPLEMENTATION, bytecode: '0x60', salt: zeroHash }

const worldOf = ({
  addr = ACCOUNT,
  code = '0x',
  initialPrivileges = [],
  associatedKeys = [],
  knownKeys,
  creation = CREATION,
  authorities = [],
  accountImplementation,
  supportsAccount = true
}: {
  addr?: string
  code?: Hex
  initialPrivileges?: [string, string][]
  associatedKeys?: string[]
  knownKeys?: Address[]
  creation?: typeof CREATION | null
  authorities?: Address[]
  accountImplementation?: Address
  supportsAccount?: boolean
}) => {
  const codeRead = { code: jest.fn<Promise<Hex>, [Address, BlockTag?]>(async () => code) }
  const action = {
    isAuthority: jest.fn<Promise<boolean>, [Address, Address]>(async (...[, key]) =>
      authorities.some((authority) => authority.toLowerCase() === key.toLowerCase())
    ),
    supportsAccount: jest.fn<Promise<boolean>, [Address]>(async () => supportsAccount),
    ambireImplementation: jest.fn(async () => IMPLEMENTATION)
  }
  const reads = createKitWalletReads({
    account: { addr, associatedKeys, initialPrivileges, creation },
    knownKeys,
    accountImplementation,
    action,
    codeRead
  })
  return { reads, codeRead, action }
}

describe('the removed key of an account with no code', () => {
  it('is the one key whose creation privilege is not zero, with no authority read', async () => {
    const { reads, action, codeRead } = worldOf({
      initialPrivileges: [
        [KEY_A, HOLDS],
        [KEY_B, zeroHash]
      ],
      associatedKeys: [KEY_C]
    })
    await expect(reads.removedKey()).resolves.toEqual({ kind: 'named', key: KEY_A })
    expect(action.isAuthority).not.toHaveBeenCalled()
    expect(codeRead.code).toHaveBeenCalledWith(ACCOUNT)
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

describe('the removed key of an account with code', () => {
  it('asks the action about each distinct known key and names the one authority', async () => {
    const { reads, action } = worldOf({
      code: ACCOUNT_CODE,
      initialPrivileges: [[KEY_A, zeroHash]],
      associatedKeys: [KEY_B, KEY_A.toLowerCase()],
      knownKeys: [KEY_C, KEY_B],
      authorities: [KEY_B]
    })
    await expect(reads.removedKey()).resolves.toEqual({ kind: 'named', key: KEY_B })
    expect(action.isAuthority.mock.calls).toEqual([
      [ACCOUNT, KEY_A],
      [ACCOUNT, KEY_B],
      [ACCOUNT, KEY_C]
    ])
  })

  it('counts an authority written in two cases once', async () => {
    const { reads, action } = worldOf({
      code: ACCOUNT_CODE,
      initialPrivileges: [[KEY_A, HOLDS]],
      associatedKeys: [KEY_A.toLowerCase()],
      authorities: [KEY_A]
    })
    await expect(reads.removedKey()).resolves.toEqual({ kind: 'named', key: KEY_A })
    expect(action.isAuthority).toHaveBeenCalledTimes(1)
  })

  it('names none where no known key is an authority, whatever the creation privileges', async () => {
    const { reads } = worldOf({
      code: ACCOUNT_CODE,
      initialPrivileges: [[KEY_A, HOLDS]],
      associatedKeys: [KEY_B]
    })
    await expect(reads.removedKey()).resolves.toEqual({
      kind: 'unavailable',
      cause: 'no-key-entry'
    })
  })

  it('names none where several known keys are authorities', async () => {
    const { reads } = worldOf({
      code: ACCOUNT_CODE,
      associatedKeys: [KEY_A, KEY_B],
      authorities: [KEY_A, KEY_B]
    })
    await expect(reads.removedKey()).resolves.toEqual({
      kind: 'unavailable',
      cause: 'several-key-entries'
    })
  })

  it('never asks about the entry point', async () => {
    const { reads, action } = worldOf({
      code: ACCOUNT_CODE,
      initialPrivileges: [[ENTRY_POINT, HOLDS]],
      associatedKeys: [KEY_A],
      authorities: [KEY_A, ENTRY_POINT]
    })
    await expect(reads.removedKey()).resolves.toEqual({ kind: 'named', key: KEY_A })
    expect(action.isAuthority.mock.calls).toEqual([[ACCOUNT, KEY_A]])
  })

  it('asks with the account address checksummed', async () => {
    const { reads, action, codeRead } = worldOf({
      addr: ACCOUNT.toLowerCase(),
      code: ACCOUNT_CODE,
      associatedKeys: [KEY_A],
      authorities: [KEY_A]
    })
    await reads.removedKey()
    expect(codeRead.code).toHaveBeenCalledWith(ACCOUNT)
    expect(action.isAuthority).toHaveBeenCalledWith(ACCOUNT, KEY_A)
  })

  it('rejects where an authority read fails', async () => {
    const failure = providerReadFailure('call', new Error('timeout'))
    const { reads, action } = worldOf({ code: ACCOUNT_CODE, associatedKeys: [KEY_A] })
    action.isAuthority.mockRejectedValueOnce(failure)
    await expect(reads.removedKey()).rejects.toBe(failure)
  })
})

describe('the removed key of an account with no creation record', () => {
  it('is unavailable, with no read', async () => {
    const { reads, action, codeRead } = worldOf({
      creation: null,
      code: ACCOUNT_CODE,
      associatedKeys: [KEY_A],
      authorities: [KEY_A]
    })
    await expect(reads.removedKey()).resolves.toEqual({
      kind: 'unavailable',
      cause: 'no-creation-record'
    })
    expect(action.isAuthority).not.toHaveBeenCalled()
    expect(codeRead.code).not.toHaveBeenCalled()
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
