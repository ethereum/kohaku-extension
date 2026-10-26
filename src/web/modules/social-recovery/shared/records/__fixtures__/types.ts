import type { Gathering, Address } from '@kohaku-eth/social-recovery'
import type {
  ExpectedRevision,
  LastAttempt,
  RecordStorage,
  WalletRecords,
  CeremonyRequestRecord,
  ChainId,
  SaveInFlightClaim
} from '@web/modules/social-recovery/shared/records'

/** The request of an approval gathering, the purpose a live session holds. */
export type ApprovalRequest = Extract<Gathering, { purpose: 'approval' }>['request']

/** The members every gathering request shares, whatever its purpose. */
export type RequestMembers = Omit<ApprovalRequest, 'payload' | 'order'>

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

/** The last attempt the manager holds, named for the test that reads it. */
export type PastCountdownCase = [name: string, last: LastAttempt]

/** A case's name and the stored payload, if any. */
export type PayloadCase = [string, string | undefined]

/** A case's name, the damaged record and what the read returns. */
export type DamagedCase = [string, Record<string, unknown>, Record<string, unknown>]

/** A case's name and a value. */
export type NamedValue = [string, unknown]

/** A case's name and how it brings the records to that state. */
export type StateCase = [string, (records: WalletRecords) => Promise<unknown>]

/** A clock a test moves. */
export type Clock = { t: number }

/** One address in two letter cases. */
export type AddressPair = [Address, Address]

/** A case's name and how the request differs. */
export type RequestVariant = [string, Partial<ApprovalRequest>]

/** An update and the account it names. */
export type UpdateCase = [SessionUpdate, Address]

/** A case's name and the update. */
export type NamedUpdate = [string, SessionUpdate]

/** A page that writes a reply: its records and its storage's read. */
export type ReplyWriter = { records: WalletRecords; storage: Pick<RecordStorage, 'get'> }

/** A case's name and the request record it stores. */
export type ReplaceCase = [string, CeremonyRequestRecord]

/** A pair of texts: a name or a call, and the value it carries. */
export type NamedText = [string, string]

/** A case's name and the claim. */
export type ClaimCase = [string, SaveInFlightClaim]

/** A storage call that writes. */
export type StorageWrite = 'set' | 'remove'

/** A chain and an account. */
export type ChainAccount = [ChainId, Address]
