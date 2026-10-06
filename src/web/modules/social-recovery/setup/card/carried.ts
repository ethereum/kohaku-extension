/**
 * Which accounts had their card carried in this tab. The first carrier runs
 * freely; every later one asks the extension password. Held in memory, so a
 * reload or a new tab starts empty, as the recovery password holder does.
 */
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'
import type { ChainId } from '@web/modules/social-recovery/shared/records'

const carried = new Set<string>()

const carriedKey = (chainId: ChainId, account: Address): string =>
  `${String(chainId)}:${account.toLowerCase()}`

export const markCardCarried = (chainId: ChainId, account: Address): void => {
  carried.add(carriedKey(chainId, account))
}

export const wasCardCarried = (chainId: ChainId, account: Address): boolean =>
  carried.has(carriedKey(chainId, account))
