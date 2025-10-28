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

export type ImportedAccountInitSource =
  | {
      name: string
      mnemonic: string
    }
  | {
      secrets: {
        masterNullifierSeed: Hex
        masterSecretSeed: Hex
      }
      name?: string
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

export function getLatestPoolAccountBlock(accountService: AccountService): bigint | undefined {
  const account = accountService.account

  // Collect all block numbers from all pool accounts
  const allBlockNumbers: bigint[] = Array.from(account.poolAccounts.values()).flatMap(
    (poolAccountsArray) =>
      poolAccountsArray.flatMap((poolAccount) => {
        const blockNumbers: bigint[] = []

        // Add deposit block number
        if (poolAccount.deposit?.blockNumber) {
          blockNumbers.push(poolAccount.deposit.blockNumber)
        }

        // Add all children commitment block numbers
        if (poolAccount.children && poolAccount.children.length > 0) {
          poolAccount.children.forEach((child) => {
            if (child.blockNumber) {
              blockNumbers.push(child.blockNumber)
            }
          })
        }

        // Add ragequit block number if it exists
        if (poolAccount.ragequit?.blockNumber) {
          blockNumbers.push(poolAccount.ragequit.blockNumber)
        }

        return blockNumbers
      })
  )

  // Return the maximum block number or undefined if no blocks exist
  if (allBlockNumbers.length === 0) return undefined

  return allBlockNumbers.reduce((max, current) => (current > max ? current : max))
}

export function serializeForStorage<T>(data: T): string {
  try {
    return JSON.stringify(data, (_key, value) => {
      // Handle bigint
      if (typeof value === 'bigint') {
        return { __type: 'bigint', value: value.toString() }
      }
      // Handle Map
      if (value instanceof Map) {
        return {
          __type: 'Map',
          value: Array.from(value.entries())
        }
      }
      // Handle Set
      if (value instanceof Set) {
        return {
          __type: 'Set',
          value: Array.from(value)
        }
      }
      return value
    })
  } catch (error) {
    throw new Error(
      `Failed to serialize data: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

export function deserializeFromStorage<T>(serialized: string): T {
  if (!serialized) {
    throw new Error('Cannot deserialize empty or null string')
  }

  try {
    return JSON.parse(serialized, (_key, value) => {
      // Handle null and undefined
      if (value === null || value === undefined) {
        return value
      }

      // Check if it's a special type object
      if (typeof value === 'object' && value.__type) {
        switch (value.__type) {
          case 'bigint':
            return BigInt(value.value)
          case 'Map':
            return new Map(value.value)
          case 'Set':
            return new Set(value.value)
          default:
            return value
        }
      }

      return value
    })
  } catch (error) {
    throw new Error(
      `Failed to deserialize data: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}
