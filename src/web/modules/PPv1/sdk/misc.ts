/* eslint-disable no-console */
import { getData, storeData } from '@web/modules/PPv1/utils/extensionStorage'
import { decrypt, encrypt } from '@web/modules/PPv1/utils/encryption'
import {
  deserializeFromStorage,
  ImportedAccountInitSource,
  serializeForStorage
} from './accountInitializer'

const DEFAULT_PRIVATE_ACCOUNT_KEY = 'TEST-private-account'
const DEFAULT_PRIVATE_ACCOUNT_PASSWORD = 'test'
const PPV1_ACCOUNTS_KEY = 'ppv1-accounts'

export interface PrivateAccountSecrets {
  masterNullifierSeed: `0x${string}`
  masterSecretSeed: `0x${string}`
}

export const storeFirstPrivateAccount = async (secrets: string | null) => {
  if (!secrets) {
    return
  }
  const encryptedSecret = await encrypt(secrets, DEFAULT_PRIVATE_ACCOUNT_PASSWORD)
  await storeData({ key: DEFAULT_PRIVATE_ACCOUNT_KEY, data: encryptedSecret })
}

export const storePrivateAccount = async (secrets: PrivateAccountSecrets) => {
  const encryptedSecret = await encrypt(JSON.stringify(secrets), DEFAULT_PRIVATE_ACCOUNT_PASSWORD)
  await storeData({ key: DEFAULT_PRIVATE_ACCOUNT_KEY, data: encryptedSecret })
}

export const getPrivateAccount = async (): Promise<PrivateAccountSecrets> => {
  const data = await getData({ key: DEFAULT_PRIVATE_ACCOUNT_KEY })
  if (!data) throw new Error('No stored private account found.')
  const decrypted = await decrypt(data, DEFAULT_PRIVATE_ACCOUNT_PASSWORD)
  const secrets = JSON.parse(decrypted) as PrivateAccountSecrets
  return secrets
}

export const getPPv1Accounts = async (): Promise<ImportedAccountInitSource[]> => {
  const data = await getData({ key: PPV1_ACCOUNTS_KEY })
  if (!data) return []
  const decrypted = await decrypt(data, DEFAULT_PRIVATE_ACCOUNT_PASSWORD)
  const deserialized = deserializeFromStorage<ImportedAccountInitSource[]>(decrypted)
  if (!deserialized) return []
  return deserialized
}

export const storePPv1Accounts = async (accountInitSource: ImportedAccountInitSource) => {
  const currentAccounts = await getPPv1Accounts()
  const accounts = [...currentAccounts, accountInitSource]
  const serialized = serializeForStorage(accounts)
  const encrypted = await encrypt(serialized, DEFAULT_PRIVATE_ACCOUNT_PASSWORD)
  await storeData({ key: PPV1_ACCOUNTS_KEY, data: encrypted })
}
