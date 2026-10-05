/**
 * The key a recovery would remove and the fit check, read from the chain.
 *
 * The keys the wallet knows for an account are its creation privileges, its
 * associated keys and the keys the wallet holds for it. Where the account has
 * code, each is asked about with the action's `isAuthority`; where it has
 * none, the creation privileges are the account's keys. Exactly one key is
 * the removed key; none or several leave it unnamed, and so does an account
 * with no creation record.
 */
import { getAddress, hexToBigInt, isAddress, isAddressEqual, isHex, size } from 'viem'

import { ERC_4337_ENTRYPOINT } from '@ambire-common/consts/deploy'
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'

import type { FitCheckReading, RemovedKeyReading } from '../../types'
import type { KitWalletReads, KitWalletReadsInput } from './types'

const holdsPrivilege = (privilege: string): boolean =>
  isHex(privilege) && hexToBigInt(privilege) !== 0n

// The entry point holds a privilege on an ERC-4337 account, but it is no key.
const isKey = (value: string): value is Address =>
  isAddress(value, { strict: false }) && !isAddressEqual(value, ERC_4337_ENTRYPOINT)

const distinctKeys = (values: readonly string[]): Address[] =>
  values
    .filter(isKey)
    .filter((key, index, keys) => keys.findIndex((other) => isAddressEqual(other, key)) === index)

const readingOf = (keys: readonly Address[]): RemovedKeyReading => {
  const [key] = keys
  if (key === undefined) {
    return { kind: 'unavailable', cause: 'no-key-entry' }
  }
  if (keys.length > 1) {
    return { kind: 'unavailable', cause: 'several-key-entries' }
  }
  return { kind: 'named', key }
}

export const createKitWalletReads = ({
  account,
  knownKeys = [],
  accountImplementation,
  action,
  codeRead
}: KitWalletReadsInput): KitWalletReads => {
  // The wallet's account record holds its address as a string; a malformed one throws here.
  const addressOf = (): Address => getAddress(account.addr)
  const hasCode = async (): Promise<boolean> => size(await codeRead.code(addressOf())) > 0

  return {
    async removedKey(): Promise<RemovedKeyReading> {
      if (!account.creation) {
        return { kind: 'unavailable', cause: 'no-creation-record' }
      }
      if (!(await hasCode())) {
        return readingOf(
          distinctKeys(
            account.initialPrivileges
              .filter(([, privilege]) => holdsPrivilege(privilege))
              .map(([key]) => key)
          )
        )
      }
      const candidates = distinctKeys([
        ...account.initialPrivileges.map(([key]) => key),
        ...account.associatedKeys,
        ...knownKeys
      ])
      const holds = await Promise.all(candidates.map((key) => action.isAuthority(addressOf(), key)))
      return readingOf(candidates.filter((_, index) => holds[index]))
    },

    async fitCheck(implementation?: Address): Promise<FitCheckReading> {
      if (await hasCode()) {
        return { basis: 'deployed-code', fits: await action.supportsAccount(addressOf()) }
      }
      const toBe = implementation ?? accountImplementation
      if (!toBe) {
        return { basis: 'no-code', fits: false }
      }
      return {
        basis: 'code-to-be',
        implementation: toBe,
        fits: isAddressEqual(toBe, await action.ambireImplementation())
      }
    }
  }
}
