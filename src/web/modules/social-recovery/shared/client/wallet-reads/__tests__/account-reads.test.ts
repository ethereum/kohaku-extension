/**
 * The key a recovery would remove from a listed account with no code, and the
 * fit check, read over a scripted provider through the SDK's action: the
 * removed key is taken from the creation privileges at the pinned block,
 * with no chain read of a key; the fit check reads the deployed code, or
 * compares the implementation to be with the action's.
 */
import { getAddress, type Hex, pad, zeroHash } from 'viem'

import { ERC_4337_ENTRYPOINT } from '@ambire-common/consts/deploy'
import type { Address } from '@kohaku-eth/social-recovery'
import {
  ACCOUNT,
  ACCOUNT_CODE,
  HEAD
} from '@web/modules/social-recovery/shared/client/__fixtures__/scripted-provider'
import { worldOf as accountWorldOf } from '@web/modules/social-recovery/shared/client/wallet-reads/__fixtures__/world'
import type { AccountReadsWorld } from '@web/modules/social-recovery/shared/client/wallet-reads/__fixtures__/types'

const KEY_A: Address = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa'
const KEY_B: Address = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB'
const KEY_C: Address = '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC'
const ENTRY_POINT = getAddress(ERC_4337_ENTRYPOINT)
const IMPLEMENTATION: Address = '0x0F2AA7bcda3d9D210dF69a394b6965CB2566c828'
const OTHER_IMPLEMENTATION: Address = '0x5555555555555555555555555555555555555555'
const HOLDS: Hex = pad('0x01')
const CREATION = { factoryAddr: OTHER_IMPLEMENTATION, bytecode: '0x60', salt: zeroHash }

const worldOf = ({
  addr,
  code = '0x',
  initialPrivileges = [],
  associatedKeys = [],
  creation = CREATION,
  accountImplementation,
  supportsAccount = true
}: AccountReadsWorld) =>
  accountWorldOf({
    addr,
    code,
    initialPrivileges,
    associatedKeys,
    creation,
    accountImplementation,
    supportsAccount
  })

describe('the removed key of an account with no code', () => {
  it('is the one key whose creation privilege is not zero, with no authority read and no scan', async () => {
    const { node, reads, askedAction } = worldOf({
      initialPrivileges: [
        [KEY_A, HOLDS],
        [KEY_B, zeroHash]
      ],
      associatedKeys: [KEY_C]
    })
    await expect(reads.removedKey()).resolves.toEqual({ kind: 'named', key: KEY_A })
    expect(askedAction()).toEqual([])
    expect(node.provider.code.mock.calls).toEqual([[ACCOUNT, HEAD]])
    expect(node.provider.logs).not.toHaveBeenCalled()
  })

  it('names none where every creation privilege is zero', async () => {
    const { reads } = worldOf({ initialPrivileges: [[KEY_A, zeroHash]] })
    await expect(reads.removedKey()).resolves.toEqual({
      kind: 'unavailable',
      cause: 'not-a-key'
    })
  })

  it('names no source where the creation record grants no key at all', async () => {
    const { reads } = worldOf({ initialPrivileges: [] })
    await expect(reads.removedKey()).resolves.toEqual({
      kind: 'unavailable',
      cause: 'no-source'
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
      const { reads, askedAction } = worldOf({ code: ACCOUNT_CODE, supportsAccount })
      await expect(reads.fitCheck(OTHER_IMPLEMENTATION)).resolves.toEqual({
        basis: 'deployed-code',
        fits: supportsAccount
      })
      expect(askedAction()).toEqual([['supportsAccount', ACCOUNT]])
    })
  )

  it("compares the code to be with the action's implementation, in any case", async () => {
    const lower = IMPLEMENTATION.toLowerCase() as Address
    const { reads, askedAction } = worldOf({})
    await expect(reads.fitCheck(lower)).resolves.toEqual({
      basis: 'code-to-be',
      implementation: lower,
      fits: true
    })
    expect(askedAction()).toEqual([['AMBIRE_IMPLEMENTATION']])
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
    const { reads, askedAction } = worldOf({})
    await expect(reads.fitCheck()).resolves.toEqual({ basis: 'no-code', fits: false })
    expect(askedAction()).toEqual([])
  })
})

describe('an account record with a malformed address', () => {
  it('rejects both reads', async () => {
    const { node, reads } = worldOf({ addr: '0x1234', initialPrivileges: [[KEY_A, HOLDS]] })
    await expect(reads.removedKey()).rejects.toThrow(/0x1234/)
    await expect(reads.fitCheck(IMPLEMENTATION)).rejects.toThrow(/0x1234/)
    expect(node.provider.code).not.toHaveBeenCalled()
  })
})
