/**
 * The privileges a listed account's creation grants, the keys a deployed kit
 * reads for an account with no code yet: a smart account's, as the account
 * library builds it, and none for a basic account.
 */
import { Wallet } from 'ethers'

import { dedicatedToOneSAPriv } from '@ambire-common/interfaces/keystore'
import { getBasicAccount, getSmartAccount } from '@ambire-common/libs/account/account'
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'
import {
  CONTROLLING_KEY,
  creationPrivilegesOf
} from '@web/modules/social-recovery/shared/client/__tests__/harness'

const SECOND_KEY = new Wallet(`0x${'66'.repeat(32)}`).address as Address

describe('creationPrivilegesOf', () => {
  it("carries a smart account's creation privileges, one pair per key", async () => {
    const smart = await getSmartAccount(
      [
        { addr: CONTROLLING_KEY, hash: dedicatedToOneSAPriv },
        { addr: SECOND_KEY, hash: dedicatedToOneSAPriv }
      ],
      []
    )
    const { initialPrivileges } = creationPrivilegesOf(smart)
    expect(initialPrivileges).toEqual(smart.initialPrivileges)
    expect(initialPrivileges?.map(([key]) => key)).toEqual([CONTROLLING_KEY, SECOND_KEY])
    expect(initialPrivileges).not.toBe(smart.initialPrivileges)
    expect(initialPrivileges?.[0]).not.toBe(smart.initialPrivileges[0])
  })

  it('gives none for a basic account, whatever privileges it lists', () => {
    const basic = getBasicAccount(SECOND_KEY, [])
    expect(
      creationPrivilegesOf({
        ...basic,
        initialPrivileges: [[SECOND_KEY, `0x${'00'.repeat(31)}01`]]
      })
    ).toEqual({})
  })
})
