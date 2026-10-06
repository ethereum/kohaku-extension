import type {
  ExpectedRevision,
  RecordStorage,
  WalletRecords
} from '@web/modules/social-recovery/shared/records'

/** A double of the extension's storage helper that stores rich JSON strings, as it does. */
export type RichJsonStorageDouble = {
  get: RecordStorage['get']
  set: (key: string, value: unknown) => Promise<null>
  remove: (key: string) => Promise<null>
  setEntries: RecordStorage['setEntries']
  removeKeys: RecordStorage['removeKeys']
  /** The helper's `get()` with no key: every entry, each value parsed. */
  getAll: () => Promise<Record<string, unknown>>
  /** What `browser.storage.local` would hold: one string per key. */
  raw: Map<string, string>
  /**
   * The keys of every `set` and `remove` call, in order, and the keys of each
   * `setEntries` and `removeKeys` call, one list per call.
   */
  calls: { set: string[]; remove: string[]; setEntries: string[][]; removeKeys: string[][] }
  /** An error the next `setEntries` or `removeKeys` call rejects with, storing nothing. */
  faults: { setEntries?: Error; removeKeys?: Error }
}

/** A storage double that holds values as given and counts each key it sets or removes. */
export type CountingStorageDouble = RecordStorage & {
  raw: Map<string, unknown>
  calls: { set: string[]; remove: string[] }
}

export type SessionUpdate = (records: WalletRecords, revision: ExpectedRevision) => Promise<unknown>

export type HolderModule = typeof import('@web/modules/social-recovery/shared/records')
