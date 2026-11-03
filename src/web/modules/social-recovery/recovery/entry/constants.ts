import { toFunctionSelector } from 'viem'
import { mainnet, sepolia } from 'viem/chains'

import type { Hex } from '@kohaku-eth/social-recovery'
import type { RecoveryChain } from '@web/modules/social-recovery/shared/client'

import type { ConfirmedStage } from './types'

export const OWNER_STAGE = 1

export const ACCOUNT_STAGE = 2

/** The search keys of the account step and of the screens after it. */
export const ENTRY_SEARCH_KEYS = {
  route: 'route',
  receivingAccount: 'to',
  account: 'account'
} as const

/**
 * The navigation state's key that says the holder acknowledged the warning on
 * the screen before; the fast track's key step passes the same key.
 */
export const ACKNOWLEDGED_STATE_KEY = 'acknowledged'

/** The navigation state a screen passes once the holder acknowledged the warning. */
export const ACKNOWLEDGED_STATE = { [ACKNOWLEDGED_STATE_KEY]: true } as const

/** The reads after the confirmation, in the order they run. */
export const CONFIRMED_STAGES: readonly ConfirmedStage[] = ['authorization', 'fit', 'destination']

/** How long one read after the confirmation may take before it counts as failed, in ms. */
export const CONFIRMED_READ_LIMIT_MS_STAND_IN = 60_000

/** The name a recovery chain goes by where the wallet holds no network record for it. */
export const CHAIN_NAMES: Record<RecoveryChain, string> = {
  sepolia: sepolia.name,
  mainnet: mainnet.name
}

/**
 * The name resolver's reverts that mean the name has no resolver, a resolver
 * that is no contract, a resolver that reverted, or no address record.
 */
export const NAME_ABSENT_REVERTS: readonly Hex[] = [
  'ResolverNotFound(bytes)',
  'ResolverNotContract(bytes,address)',
  'ResolverError(bytes)',
  'UnsupportedResolverProfile(bytes4)'
].map((signature) => toFunctionSelector(signature))

/**
 * The off-chain lookup's reason when its gateway answered that the name holds
 * no record. Every other off-chain fault is a gateway or transport failure.
 */
export const NAME_ABSENT_OFFCHAIN_REASON = '404_MISSING_RESOURCE'
