/**
 * The recovery password holder: the password the privacy step collects, kept
 * in memory by chain and account, never written to storage, wiped when the
 * setup it was typed for is started over and kept when it is saved.
 *
 * The records run against an in-memory storage double that counts its `set`
 * and `remove` calls, so a test sees every storage write a holder call makes.
 */
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'
import {
  ABSENT,
  ChainId,
  createWalletRecords,
  readRecoveryPassword,
  recordKeys,
  RecordStorage,
  setRecoveryPassword,
  wipeRecoveryPassword
} from '@web/modules/social-recovery/shared/records'

type StorageDouble = RecordStorage & {
  raw: Map<string, unknown>
  calls: { set: string[]; remove: string[] }
}

type HolderModule = typeof import('@web/modules/social-recovery/shared/records')

const makeStorage = ({ failRemove = false } = {}): StorageDouble => {
  const raw = new Map<string, unknown>()
  const calls = { set: [] as string[], remove: [] as string[] }
  return {
    raw,
    calls,
    get: async (key?: string, defaultValue?: unknown) =>
      key !== undefined && raw.has(key) ? raw.get(key) : defaultValue,
    set: async (key: string, value: unknown) => {
      calls.set.push(key)
      raw.set(key, value)
      return null
    },
    remove: async (key: string) => {
      calls.remove.push(key)
      if (failRemove) throw new Error('storage remove failed')
      raw.delete(key)
      return null
    }
  } as StorageDouble
}

const ACCOUNT: Address = '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed'
const ACCOUNT_CHECKSUMMED: Address = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
const OTHER_ACCOUNT: Address = '0x2222222222222222222222222222222222222222'
const CHAIN_ID: ChainId = 11155111n
const OTHER_CHAIN_ID: ChainId = 1n
const PASSWORD = 'correct horse battery staple'
const OTHER_PASSWORD = 'tr0ub4dor&3'

const PAIRS: [ChainId, Address][] = [
  [CHAIN_ID, ACCOUNT],
  [CHAIN_ID, OTHER_ACCOUNT],
  [OTHER_CHAIN_ID, ACCOUNT],
  [OTHER_CHAIN_ID, OTHER_ACCOUNT]
]

// The holder is one per module instance, so every test leaves it empty.
afterEach(() => {
  PAIRS.forEach(([chainId, account]) => wipeRecoveryPassword(chainId, account))
})

describe('the recovery password holder', () => {
  it('reads back the password set for a chain and account', () => {
    setRecoveryPassword(CHAIN_ID, ACCOUNT, PASSWORD)
    expect(readRecoveryPassword(CHAIN_ID, ACCOUNT)).toBe(PASSWORD)
  })

  it('reads nothing for an account or chain it holds no password for', () => {
    expect(readRecoveryPassword(CHAIN_ID, ACCOUNT)).toBeUndefined()
    setRecoveryPassword(CHAIN_ID, ACCOUNT, PASSWORD)
    expect(readRecoveryPassword(CHAIN_ID, OTHER_ACCOUNT)).toBeUndefined()
    expect(readRecoveryPassword(OTHER_CHAIN_ID, ACCOUNT)).toBeUndefined()
  })

  it('keeps one password per chain and account', () => {
    setRecoveryPassword(CHAIN_ID, ACCOUNT, PASSWORD)
    setRecoveryPassword(CHAIN_ID, OTHER_ACCOUNT, OTHER_PASSWORD)
    setRecoveryPassword(OTHER_CHAIN_ID, ACCOUNT, OTHER_PASSWORD)
    expect(readRecoveryPassword(CHAIN_ID, ACCOUNT)).toBe(PASSWORD)
    expect(readRecoveryPassword(CHAIN_ID, OTHER_ACCOUNT)).toBe(OTHER_PASSWORD)
    expect(readRecoveryPassword(OTHER_CHAIN_ID, ACCOUNT)).toBe(OTHER_PASSWORD)
  })

  it('a second set replaces the password', () => {
    setRecoveryPassword(CHAIN_ID, ACCOUNT, PASSWORD)
    setRecoveryPassword(CHAIN_ID, ACCOUNT, OTHER_PASSWORD)
    expect(readRecoveryPassword(CHAIN_ID, ACCOUNT)).toBe(OTHER_PASSWORD)
  })

  it('finds the account in any address case and the chain as a number or a bigint', () => {
    setRecoveryPassword(CHAIN_ID, ACCOUNT_CHECKSUMMED, PASSWORD)
    expect(readRecoveryPassword(CHAIN_ID, ACCOUNT)).toBe(PASSWORD)
    expect(readRecoveryPassword(Number(CHAIN_ID), ACCOUNT_CHECKSUMMED)).toBe(PASSWORD)
  })

  it('wipe clears the password of that chain and account only', () => {
    setRecoveryPassword(CHAIN_ID, ACCOUNT, PASSWORD)
    setRecoveryPassword(CHAIN_ID, OTHER_ACCOUNT, OTHER_PASSWORD)
    wipeRecoveryPassword(CHAIN_ID, ACCOUNT_CHECKSUMMED)
    expect(readRecoveryPassword(CHAIN_ID, ACCOUNT)).toBeUndefined()
    expect(readRecoveryPassword(CHAIN_ID, OTHER_ACCOUNT)).toBe(OTHER_PASSWORD)
  })

  it('wipe on an empty holder does nothing', () => {
    expect(() => wipeRecoveryPassword(CHAIN_ID, ACCOUNT)).not.toThrow()
    expect(readRecoveryPassword(CHAIN_ID, ACCOUNT)).toBeUndefined()
  })

  it('a fresh module instance starts empty', () => {
    setRecoveryPassword(CHAIN_ID, ACCOUNT, PASSWORD)
    let fresh: HolderModule | undefined
    jest.isolateModules(() => {
      // eslint-disable-next-line global-require
      fresh = require('@web/modules/social-recovery/shared/records')
    })
    expect(fresh).toBeDefined()
    expect(fresh!.readRecoveryPassword(CHAIN_ID, ACCOUNT)).toBeUndefined()
    expect(readRecoveryPassword(CHAIN_ID, ACCOUNT)).toBe(PASSWORD)
  })

  it('no holder call writes to or removes from the storage', async () => {
    const storage = makeStorage()
    const records = createWalletRecords({ storage })
    await records.setup(CHAIN_ID, ACCOUNT).passwordSet.write('password-set')
    const writes = [...storage.calls.set]
    const removes = [...storage.calls.remove]
    const stored = new Map(storage.raw)

    setRecoveryPassword(CHAIN_ID, ACCOUNT, PASSWORD)
    readRecoveryPassword(CHAIN_ID, ACCOUNT)
    wipeRecoveryPassword(CHAIN_ID, ACCOUNT)
    setRecoveryPassword(CHAIN_ID, ACCOUNT, PASSWORD)

    expect(storage.calls.set).toEqual(writes)
    expect(storage.calls.remove).toEqual(removes)
    expect(storage.raw).toEqual(stored)
    expect(JSON.stringify([...storage.raw.values()])).not.toContain(PASSWORD)
  })

  it('setting the password leaves the password-set flag as the records hold it', async () => {
    const storage = makeStorage()
    const records = createWalletRecords({ storage })
    setRecoveryPassword(CHAIN_ID, ACCOUNT, PASSWORD)
    expect(await records.setup(CHAIN_ID, ACCOUNT).passwordSet.read()).toBe(ABSENT)
    expect(storage.raw.has(recordKeys.setup('passwordSet', CHAIN_ID, ACCOUNT))).toBe(false)
  })
})

describe('the setup records and the recovery password', () => {
  it('startOverSetup clears the password of that chain and account only', async () => {
    const storage = makeStorage()
    const records = createWalletRecords({ storage })
    await records.setup(CHAIN_ID, ACCOUNT).passwordSet.write('password-set')
    setRecoveryPassword(CHAIN_ID, ACCOUNT, PASSWORD)
    setRecoveryPassword(CHAIN_ID, OTHER_ACCOUNT, OTHER_PASSWORD)
    setRecoveryPassword(OTHER_CHAIN_ID, ACCOUNT, OTHER_PASSWORD)

    await records.startOverSetup(CHAIN_ID, ACCOUNT_CHECKSUMMED)

    expect(readRecoveryPassword(CHAIN_ID, ACCOUNT)).toBeUndefined()
    expect(readRecoveryPassword(CHAIN_ID, OTHER_ACCOUNT)).toBe(OTHER_PASSWORD)
    expect(readRecoveryPassword(OTHER_CHAIN_ID, ACCOUNT)).toBe(OTHER_PASSWORD)
    expect(storage.raw.has(recordKeys.setup('passwordSet', CHAIN_ID, ACCOUNT))).toBe(false)
  })

  it('startOverSetup keeps the password when the storage fails to wipe the setup records', async () => {
    const storage = makeStorage({ failRemove: true })
    const records = createWalletRecords({ storage })
    setRecoveryPassword(CHAIN_ID, ACCOUNT, PASSWORD)

    await expect(records.startOverSetup(CHAIN_ID, ACCOUNT)).rejects.toThrow('storage remove failed')

    expect(readRecoveryPassword(CHAIN_ID, ACCOUNT)).toBe(PASSWORD)
  })

  it('saveSetup wipes the setup records and keeps the password for the Recovery Card', async () => {
    const storage = makeStorage()
    const records = createWalletRecords({ storage })
    await records.setup(CHAIN_ID, ACCOUNT).passwordSet.write('password-set')
    setRecoveryPassword(CHAIN_ID, ACCOUNT, PASSWORD)

    await records.saveSetup(CHAIN_ID, ACCOUNT_CHECKSUMMED)

    expect(readRecoveryPassword(CHAIN_ID, ACCOUNT)).toBe(PASSWORD)
    expect(storage.raw.has(recordKeys.setup('passwordSet', CHAIN_ID, ACCOUNT))).toBe(false)
  })
})
