/* eslint-disable no-console */
import { getData, storeData } from '@web/modules/PPv1/utils/extensionStorage'
import { decrypt, encrypt } from '@web/modules/PPv1/utils/encryption'
import { PoolAccount } from '@0xbow/privacy-pools-core-sdk'
import { deserializeFromStorage, serializeForStorage } from './accountInitializer'

const DEFAULT_PRIVATE_ACCOUNT_KEY = 'TEST-private-account'
const DEFAULT_PRIVATE_ACCOUNT_PASSWORD = 'test'
const PPV1_ACCOUNT_KEY = 'ppv1-account'

export interface PrivateAccountSecrets {
  masterNullifierSeed: `0x${string}`
  masterSecretSeed: `0x${string}`
}

export const storeFirstPrivateAccount = async (secrets: string | null) => {
  if (!secrets) {
    console.log('DEBUG: No secrets provided.')
    return
  }
  const encryptedSecret = await encrypt(secrets, DEFAULT_PRIVATE_ACCOUNT_PASSWORD)
  await storeData({ key: DEFAULT_PRIVATE_ACCOUNT_KEY, data: encryptedSecret })
}

export const storePrivateAccount = async (secrets: PrivateAccountSecrets) => {
  console.log('DEBUG: Storing private account with secrets:', secrets)
  const encryptedSecret = await encrypt(JSON.stringify(secrets), DEFAULT_PRIVATE_ACCOUNT_PASSWORD)
  await storeData({ key: DEFAULT_PRIVATE_ACCOUNT_KEY, data: encryptedSecret })
}

export const loadPrivateAccount = async (): Promise<PrivateAccountSecrets> => {
  const data = await getData({ key: DEFAULT_PRIVATE_ACCOUNT_KEY })
  if (!data) throw new Error('No stored private account found.')
  const decrypted = await decrypt(data, DEFAULT_PRIVATE_ACCOUNT_PASSWORD)
  const secrets = JSON.parse(decrypted) as PrivateAccountSecrets
  return secrets
}

interface PPv1Account {
  lastSyncedBlock: number
  accounts: {
    account_idx: number
    master_nullifier: number
    master_secret: number
    poolAccount: PoolAccount[]
  }[]
}

export const storePPv1Accounts = async (account: PPv1Account) => {
  const serialized = serializeForStorage(account)
  await storeData({ key: PPV1_ACCOUNT_KEY, data: serialized })
}

export const loadPPv1Accounts = async (): Promise<PPv1Account> => {
  const data = await getData({ key: PPV1_ACCOUNT_KEY })
  if (!data) return { lastSyncedBlock: 0, accounts: [] }
  const deserialized = deserializeFromStorage<PPv1Account>(data)
  if (!deserialized) return { lastSyncedBlock: 0, accounts: [] }
  return deserialized
}
