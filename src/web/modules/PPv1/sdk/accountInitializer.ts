import { Hex, hexToBigInt } from 'viem'
import { poseidon } from 'maci-crypto/build/ts/hashing'
import {
  type PoolInfo,
  type DataService,
  type PoolEventsError,
  type PrivacyPoolAccount,
  type Secret,
  AccountService,
  AccountError
} from '@0xbow/privacy-pools-core-sdk'

/**
 * Source configuration for account initialization
 */
export type AccountInitSource =
  | {
      mnemonic: string
    }
  | {
      secrets: {
        masterNullifierSeed: Hex
        masterSecretSeed: Hex
      }
    }

/**
 * Result of account initialization
 */
export type InitializeAccountResult = {
  accountService: AccountService
  errors: PoolEventsError[]
}

/**
 * Converts secrets (masterNullifierSeed and masterSecretSeed) to a PrivacyPoolAccount.
 * This allows using secrets with the SDK's AccountService which only accepts mnemonic or account.
 *
 * @param secrets - The master nullifier and secret seeds
 * @returns A PrivacyPoolAccount initialized with the provided secrets
 */
function createAccountFromSecrets(secrets: {
  masterNullifierSeed: Hex
  masterSecretSeed: Hex
}): PrivacyPoolAccount {
  try {
    const masterNullifierSeed = hexToBigInt(secrets.masterNullifierSeed)
    const masterSecretSeed = hexToBigInt(secrets.masterSecretSeed)

    const masterNullifier = poseidon([masterNullifierSeed]) as Secret
    const masterSecret = poseidon([masterSecretSeed]) as Secret

    return {
      masterKeys: [masterNullifier, masterSecret],
      poolAccounts: new Map(),
      creationTimestamp: 0n,
      lastUpdateTimestamp: 0n
    }
  } catch (error) {
    throw AccountError.accountInitializationFailed(
      error instanceof Error ? error.message : 'Unknown error'
    )
  }
}

/**
 * Initializes an AccountService instance with events for a given set of pools.
 * This wrapper uses the SDK's AccountService directly, with support for both mnemonic and secrets.
 *
 * @param dataService - The data service to use for fetching on-chain events
 * @param source - The source to use for initializing the account (mnemonic or secrets)
 * @param pools - The pools to fetch events for
 *
 * @returns The initialized AccountService instance and array of errors if any pool events fetching fails
 *
 * @throws {AccountError} If account state reconstruction fails or if duplicate pools are found
 *
 * @example
 * ```typescript
 * // Initialize with secrets
 * const result = await initializeAccountWithEvents(
 *   dataService,
 *   {
 *     secrets: {
 *       masterNullifierSeed: '0x...',
 *       masterSecretSeed: '0x...'
 *     }
 *   },
 *   pools
 * )
 *
 * // Initialize with mnemonic
 * const result = await initializeAccountWithEvents(
 *   dataService,
 *   { mnemonic: 'your mnemonic phrase here' },
 *   pools
 * )
 * ```
 */
export async function initializeAccountWithEvents(
  dataService: DataService,
  source: AccountInitSource,
  pools: PoolInfo[]
): Promise<{
  account: AccountService
  errors: PoolEventsError[]
}> {
  if ('mnemonic' in source) {
    // Use mnemonic directly with SDK
    return AccountService.initializeWithEvents(dataService, { mnemonic: source.mnemonic }, pools)
  }
  // Convert secrets to PrivacyPoolAccount and use with SDK
  const accountWithKeys = createAccountFromSecrets(source.secrets)
  const result = new AccountService(dataService, { account: accountWithKeys })
  return AccountService.initializeWithEvents(dataService, { service: result }, pools)
}
