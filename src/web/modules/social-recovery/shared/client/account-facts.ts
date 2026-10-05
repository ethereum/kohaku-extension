/**
 * The facts the wallet holds for one account it lists, read from its own
 * state: whether the account has code on the recovery chain, the account's key
 * the keystore holds, and the account's creation record.
 */
import isEqual from 'react-fast-compare'

import type { Account } from '@ambire-common/interfaces/account'
import type { Address, CreationRecord, Hex } from '@web/modules/social-recovery/sdk-interfaces'

import { sameAddress } from './addresses'
import { CHAIN_IDS, WALLET_RECOVERY_CHAIN } from './chains'
import { networkOf } from './extension-provider'
import type {
  AccountFacts,
  AccountFactsReading,
  AccountFactsSources,
  AccountStateRefresh,
  KeyHandle,
  ListedAccountFacts
} from './types'

/**
 * The block a creation record names. The wallet holds none: an account with
 * no code has no creation block yet, and the wallet does not read the block a
 * deployed account was created at. Zero, the lowest block, stands in, so a
 * read from it misses nothing.
 */
export const CREATION_BLOCK_STAND_IN = 0

/** The creation record of a listed account, or undefined for a basic account. */
export const creationRecordOf = (account: Pick<Account, 'creation'>): CreationRecord | undefined =>
  account.creation
    ? {
        factory: account.creation.factoryAddr as Address,
        bytecode: account.creation.bytecode as Hex,
        salt: account.creation.salt as Hex,
        block: CREATION_BLOCK_STAND_IN
      }
    : undefined

/**
 * The client facts of a listed account: its creation record and its
 * associated keys as the keys the client asks about. A basic account gives
 * none, so its client reads as one built with no facts.
 */
export const clientFactsOf = (
  account: Pick<Account, 'associatedKeys' | 'creation'>
): AccountFacts => {
  const creation = creationRecordOf(account)
  return creation
    ? { creation, candidateKeys: account.associatedKeys.map((key) => key as Address) }
    : {}
}

/**
 * The privileges a listed smart account's creation grants, which a deployed
 * kit reads as the keys of an account with no code yet. A basic account
 * gives none.
 */
export const creationPrivilegesOf = (
  account: Pick<Account, 'creation' | 'initialPrivileges'>
): Pick<AccountFacts, 'initialPrivileges'> =>
  account.creation
    ? {
        initialPrivileges: account.initialPrivileges.map(([key, privilege]): [string, string] => [
          key,
          privilege
        ])
      }
    : {}

/**
 * The account's key the keystore holds: the first of the account's associated
 * keys the keystore has an entry for, with that entry's type. Undefined where
 * it holds none.
 */
const heldKeyOf = (
  account: Pick<Account, 'associatedKeys'>,
  keys: NonNullable<AccountFactsSources['keys']>
): KeyHandle | undefined => {
  const held = account.associatedKeys
    .map((associated) => keys.find((key) => sameAddress(key.addr, associated)))
    .find((key) => key !== undefined)
  return held ? { addr: held.addr as Address, type: held.type } : undefined
}

/**
 * The facts of a listed account on the recovery chain, from the wallet's own
 * state. With no state for the account on the chain it reads as loading, or as
 * `state-unread` once the chain's provider reports it is not working or a
 * refresh of the state ended with none.
 */
export const accountFactsOf = (
  address: Address | undefined,
  sources: AccountFactsSources
): AccountFactsReading => {
  const { accounts, accountStates, keys, networks } = sources
  if (!address || !accounts || !accountStates || !keys || !networks) {
    return { status: 'loading' }
  }
  const account = accounts.find((candidate) => sameAddress(candidate.addr, address))
  if (!account) {
    return { status: 'unavailable', cause: 'not-listed' }
  }
  const network = networkOf(networks, WALLET_RECOVERY_CHAIN)
  if (!network) {
    return { status: 'unavailable', cause: 'no-network' }
  }
  const state = accountStates[account.addr]?.[String(CHAIN_IDS[WALLET_RECOVERY_CHAIN])]
  if (!state) {
    return sources.providerWorking === false || sources.stateRefreshSettled === true
      ? { status: 'unavailable', cause: 'state-unread' }
      : { status: 'loading' }
  }
  const key = heldKeyOf(account, keys)
  const creation = creationRecordOf(account)
  return {
    status: 'ready',
    facts: {
      account,
      state,
      network,
      deployed: state.isDeployed,
      ...(key ? { key } : {}),
      ...(creation ? { creation } : {})
    }
  }
}

/**
 * The refresh that reads a listed account's state on the recovery chain, where
 * the wallet holds the account and the chain's network but no state for the
 * account there. Undefined otherwise.
 */
export const stateRefreshOf = (
  address: Address | undefined,
  sources: Pick<AccountFactsSources, 'accounts' | 'accountStates' | 'networks'>
): AccountStateRefresh | undefined => {
  const { accounts, accountStates, networks } = sources
  if (!address || !accounts || !accountStates || !networks) {
    return undefined
  }
  const account = accounts.find((candidate) => sameAddress(candidate.addr, address))
  const network = networkOf(networks, WALLET_RECOVERY_CHAIN)
  if (
    !account ||
    !network ||
    accountStates[account.addr]?.[String(CHAIN_IDS[WALLET_RECOVERY_CHAIN])]
  ) {
    return undefined
  }
  return { addr: account.addr, chainIds: [network.chainId] }
}

/**
 * What a screen reads of ready facts: the account's record with its label but
 * no other preference, the members of its state the account library builds
 * the account's own transaction from, the network's name and symbol, the held
 * key and the creation record.
 */
const factsReadOf = (facts: ListedAccountFacts) => ({
  account: {
    addr: facts.account.addr,
    label: facts.account.preferences.label,
    associatedKeys: facts.account.associatedKeys,
    initialPrivileges: facts.account.initialPrivileges,
    creation: facts.account.creation
  },
  state: {
    isDeployed: facts.state.isDeployed,
    nonce: facts.state.nonce,
    isEOA: facts.state.isEOA,
    isV2: facts.state.isV2,
    isSmarterEoa: facts.state.isSmarterEoa
  },
  network: {
    chainId: facts.network.chainId,
    name: facts.network.name,
    nativeAssetSymbol: facts.network.nativeAssetSymbol
  },
  deployed: facts.deployed,
  key: facts.key,
  creation: facts.creation
})

/**
 * Whether two readings hold the same for a screen: the same status and cause,
 * or ready facts that agree on everything a screen reads (`factsReadOf`). The
 * account's balance, its block and its preferences other than the label do
 * not count.
 */
export const sameFactsReading = (a: AccountFactsReading, b: AccountFactsReading): boolean => {
  if (a.status === 'ready' && b.status === 'ready') {
    return isEqual(factsReadOf(a.facts), factsReadOf(b.facts))
  }
  return isEqual(a, b)
}
