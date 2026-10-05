/**
 * The wallet's own reads, under the name screens use.
 *
 * Three reads the screens need are not SDK members: the verify per pasted
 * reply, the key a recovery would remove, and the fit check against the code
 * the account will carry. The doubles script them as `IWalletReadsDouble`;
 * this folder hands them to screens as `WalletReads` (types.ts), so no screen
 * imports the doubles' name and the real implementation replaces the double
 * here alone. Each read throws when it could not be made and never answers
 * empty.
 *
 * The SDK does not list who holds a privilege on an account either, so the
 * wallet reads that with its own account code: the account's `privileges`
 * view where the account has code, the privileges its creation writes where
 * it has a creation record and no code, and the account itself where it has
 * neither, since a basic key controls itself.
 */
import { Interface } from 'ethers'
import { hexToBigInt, isAddress, isAddressEqual, isHex } from 'viem'

import { ERC_4337_ENTRYPOINT } from '@ambire-common/consts/deploy'
import AmbireAccount from '@contracts/compiled/AmbireAccount.json'
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'

import { quantityOf } from './provider-adapter'
import type {
  PrivilegeAccount,
  PrivilegeHoldersReading,
  PrivilegeReads,
  PrivilegeReadsProvider
} from './types'

export { REMOVED_KEY_UNAVAILABLE_CAUSES } from '@web/modules/social-recovery/sdk-doubles'

const accountInterface = new Interface(AmbireAccount.abi)

export const holdsPrivilege = (privilege: string): boolean =>
  isHex(privilege) && hexToBigInt(privilege) !== 0n

// The entry point holds a privilege on an ERC-4337 account, but it is no key.
const isKey = (value: string): value is Address =>
  isAddress(value, { strict: false }) && !isAddressEqual(value, ERC_4337_ENTRYPOINT)

export const distinctKeys = (values: readonly string[]): Address[] =>
  values
    .filter(isKey)
    .filter((key, index, keys) => keys.findIndex((other) => isAddressEqual(other, key)) === index)

/**
 * The privilege holders read over the extension's provider. Where the account
 * has code, it asks the account's `privileges` view about each key the wallet
 * knows and each of the account's associated keys, and answers those with a
 * non-zero privilege. Where the account has no code, it answers the keys its
 * initial privileges name, or the account itself when it has no creation
 * record. A provider on another chain, or a read the provider
 * could not make, answers `unreadable` with its cause.
 */
export const createPrivilegeReads = (
  provider: PrivilegeReadsProvider,
  knownKeys: readonly Address[] = []
): PrivilegeReads => ({
  async privilegeHoldersOf(
    account: PrivilegeAccount,
    chainId: number | bigint
  ): Promise<PrivilegeHoldersReading> {
    try {
      const answered = quantityOf(await provider.send('eth_chainId', []))
      if (answered !== BigInt(chainId)) {
        return {
          kind: 'unreadable',
          cause: `The provider answers chain ${answered}, not chain ${chainId}.`
        }
      }
      const code = await provider.getCode(account.addr)
      if (code === '0x') {
        if (!account.creation) {
          return { kind: 'holders', keys: distinctKeys([account.addr]) }
        }
        return {
          kind: 'holders',
          keys: distinctKeys(
            account.initialPrivileges
              .filter(([, privilege]) => holdsPrivilege(privilege))
              .map(([key]) => key)
          )
        }
      }
      const candidates = distinctKeys([...knownKeys, ...account.associatedKeys])
      const privileges = await Promise.all(
        candidates.map(async (key): Promise<string> => {
          const answer = await provider.call({
            to: account.addr,
            data: accountInterface.encodeFunctionData('privileges', [key])
          })
          return accountInterface.decodeFunctionResult('privileges', answer)[0]
        })
      )
      return {
        kind: 'holders',
        keys: candidates.filter((_, index) => holdsPrivilege(privileges[index]))
      }
    } catch (thrown) {
      return {
        kind: 'unreadable',
        cause: thrown instanceof Error ? thrown.message : String(thrown)
      }
    }
  }
})
