import type { Root as ReactRoot } from 'react-dom/client'
import { encodeAbiParameters } from 'viem'

import { parse, stringify } from '@ambire-common/libs/richJson/richJson'
import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import themeConfig, { THEME_TYPES } from '@common/styles/themeConfig'
import type { ThemeProps } from '@common/styles/themeConfig'
import type {
  Address,
  Clause,
  Credential,
  Hex,
  SetupDraft,
  ValidationResult
} from '@web/modules/social-recovery/sdk-interfaces'
import { addressBookOf } from '@web/modules/social-recovery/shared/client'
import type {
  Enrollment,
  RecordStorage,
  SetupRecords
} from '@web/modules/social-recovery/shared/records'
import { createWalletRecords } from '@web/modules/social-recovery/shared/records'

import { kindOf, sameCredential } from '@web/modules/social-recovery/setup/editor/operations'

export const BOOK = addressBookOf('sepolia')

/** The light theme, which the wallet's buttons read their hover colours from. */
export const THEME_CONTEXT: ThemeContextReturnType = {
  theme: Object.fromEntries(
    Object.entries(themeConfig).map(([name, byType]) => [name, byType[THEME_TYPES.LIGHT]])
  ) as ThemeProps,
  themeType: THEME_TYPES.LIGHT,
  selectedThemeType: THEME_TYPES.LIGHT,
  setThemeType: () => {}
}

export const CHAIN_ID = 11155111
export const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'

/** A guardian's address, the one its config holds ABI-encoded in one word. */
export const guardianAddress = (byte: string): Address => `0x${byte.repeat(20)}`

const guardianConfig = (byte: string): Hex =>
  encodeAbiParameters([{ type: 'address' }], [guardianAddress(byte)])

/** A guardian credential whose config holds the address `byte` repeated. */
export const guardianOf = (byte: string, label: string): Credential => ({
  method: BOOK.methods.ecdsa,
  config: guardianConfig(byte),
  label
})

export const ALICE = guardianOf('a1', 'Alice')
export const BOB = guardianOf('b2', 'Bob')
export const CAROL = guardianOf('c3', 'Carol')
export const DAVE = guardianOf('d4', 'Dave')
export const PASSKEY: Credential = {
  method: BOOK.methods.passkey,
  config: '0x0102030405060708',
  label: 'Laptop'
}
export const PASSPORT: Credential = {
  method: BOOK.methods.zkpassport,
  config: '0xfeedface'
}
export const AADHAAR: Credential = {
  method: BOOK.methods.aadhaar,
  config: '0xabcdef01'
}

export const ENROLLED = [ALICE, BOB, CAROL, DAVE, PASSKEY, PASSPORT, AADHAAR]

/** A required passkey row, then a group of two of three: two guardians and a passport. */
export const presetPath = (): Clause[] => [
  { threshold: 1, credentials: [PASSKEY] },
  { threshold: 2, credentials: [ALICE, BOB, PASSPORT] }
]

/** A required passkey row, then two groups: two of two guardians, and one of a guardian and a passport. */
export const twoGroupPath = (): Clause[] => [
  { threshold: 1, credentials: [PASSKEY] },
  { threshold: 2, credentials: [ALICE, BOB] },
  { threshold: 1, credentials: [CAROL, PASSPORT] }
]

export const enrolled = (credential: Credential): Enrollment => ({
  credential,
  test: 'passed'
})

/**
 * The extension's storage helper in memory: a non-string value is stored as
 * its rich JSON string, so a draft's `bigint` wait survives, and every key a
 * `set` or a `setEntries` writes is counted. `rejectOnce` makes the next read
 * or write of one setup record reject, the way a full or unreachable storage
 * does; a `setEntries` that holds a rejected key writes none of its keys.
 */
export interface StorageDouble extends RecordStorage {
  raw: Map<string, string>
  sets: string[]
  rejectOnce: (operation: 'get' | 'set', record: string) => void
}

/** The root a view test renders the editor into. */
export type Root = ReactRoot

/** The fake path check a view test hands the editor's client. */
export type Validate = (draft: SetupDraft) => Promise<ValidationResult>

/**
 * What a view test stores before the editor opens, and the client it hands
 * it: a ready client whose path check is `validate`, or one that loads, is
 * refused, or asks for a wallet update with `retry`. `beforeRender` reaches
 * the storage once the records are written and before the editor reads them.
 */
export interface MountOptions {
  clauses?: Clause[]
  enrollments?: Enrollment[]
  validate?: Validate
  client?: 'loading' | 'refused' | 'update-the-wallet'
  retry?: () => void
  beforeRender?: (storage: StorageDouble) => void
}

export const makeStorage = (): StorageDouble => {
  const raw = new Map<string, string>()
  const sets: string[] = []
  const pending: { operation: 'get' | 'set'; record: string }[] = []
  const takeRejection = (operation: 'get' | 'set', key: string) => {
    const index = pending.findIndex(
      (entry) => entry.operation === operation && key.includes(`:${entry.record}:`)
    )
    if (index < 0) {
      return false
    }
    pending.splice(index, 1)
    return true
  }
  return {
    raw,
    sets,
    rejectOnce: (operation, record) => {
      pending.push({ operation, record })
    },
    get: async (key, defaultValue) => {
      if (key && takeRejection('get', key)) {
        throw new Error('storage unavailable')
      }
      const stored = key && raw.get(key)
      return stored ? parse(stored) : defaultValue
    },
    set: async (key, value) => {
      if (takeRejection('set', key)) {
        throw new Error('storage full')
      }
      sets.push(key)
      raw.set(key, typeof value === 'string' ? value : stringify(value))
      return null
    },
    remove: async (key) => {
      raw.delete(key)
      return null
    },
    setEntries: async (entries) => {
      const keys = Object.keys(entries)
      if (keys.some((key) => takeRejection('set', key))) {
        throw new Error('storage full')
      }
      keys.forEach((key) => {
        const value = entries[key]
        sets.push(key)
        raw.set(key, typeof value === 'string' ? value : stringify(value))
      })
    },
    removeKeys: async (keys) => {
      keys.forEach((key) => raw.delete(key))
    }
  }
}

export const makeRecords = (): { storage: StorageDouble; records: SetupRecords } => {
  const storage = makeStorage()
  const records = createWalletRecords({ storage }).setup(CHAIN_ID, ACCOUNT)
  return { storage, records }
}

// Jest runs every file under __tests__, this one included; its own check runs
// only when Jest runs this file, never from a file that imports the harness.
if (expect.getState().testPath === __filename) {
  describe('harness', () => {
    it('holds enrolled credentials that are pairwise different methods, each of a known kind', () => {
      ENROLLED.forEach((credential) => expect(kindOf(credential, BOOK)).toBeDefined())
      ENROLLED.forEach((a, i) =>
        ENROLLED.forEach((b, j) => expect(sameCredential(a, b)).toBe(i === j))
      )
    })

    it('stores a draft and reads it back with its bigint wait, counting the write', async () => {
      const { storage, records } = makeRecords()
      const draft = {
        wait: 86400n,
        clauses: presetPath(),
        ignoresPause: false,
        privacy: { publicMetadata: '0x' as const, backup: 'encrypted' as const }
      }
      await records.setupDraft.write(draft)
      const read = await records.setupDraft.read()
      expect(read.status === 'present' && read.value).toEqual(draft)
      expect(storage.sets).toHaveLength(1)
    })

    it('rejects the next read or write of the named record once, then serves it again', async () => {
      const { storage, records } = makeRecords()
      storage.rejectOnce('set', 'path')
      await expect(records.path.write(presetPath())).rejects.toThrow()
      await records.path.write(presetPath())
      storage.rejectOnce('get', 'path')
      await expect(records.path.read()).rejects.toThrow()
      const read = await records.path.read()
      expect(read.status === 'present' && read.value).toEqual(presetPath())
      expect(storage.sets).toHaveLength(1)
    })
  })
}
