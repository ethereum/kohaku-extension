/* eslint-disable max-classes-per-file -- the two refusals a records update throws */
/**
 * The wallet's records: the social recovery records this device keeps, in the
 * extension's local storage and never in a background controller, since the
 * worker restarts and clears its controllers. The SDK stores nothing, so the
 * setup draft, the recovery session, the setup cache and the ceremony tab's
 * requests live here and the SDK sees them only as arguments.
 *
 * Every record is stored as `{ value, savedAt }`, `savedAt` in ms since epoch,
 * never as a bare boolean or zero, since the storage helper's read returns the
 * default for a falsy stored value. The recovery session also stores its
 * `revision`. A read of a record that is not stored, or not stored in that
 * shape, returns `ABSENT`. The helper stores rich JSON, so a `bigint` value
 * survives.
 */
import isEqual from 'react-fast-compare'
import { bytesToHex, isAddress, isAddressEqual, isHex, keccak256 } from 'viem'

import { parse, stringify } from '@ambire-common/libs/richJson/richJson'
import type {
  Address,
  ApproverRequest,
  Credential,
  Gathering,
  GatheringPlace,
  Hex
} from '@kohaku-eth/social-recovery'

import { RECOVERY_ROUTES, ROW_NOTES } from './constants'
import {
  isOfDeployment,
  recordDeploymentFrom,
  recordDeploymentOf,
  isSessionOfDeployment
} from './deployment'
import { isDecimalString, isStoredAddress, isStoredSeconds } from './guards'
import { wipeRecoveryPassword } from './recoveryPassword'
import { ABSENT, SETUP_RECORD_NAMES } from './types'
import type {
  CeremonyRequestRecord,
  ChainCountdown,
  ChainId,
  CountdownAccessor,
  CountdownRead,
  CountdownRecord,
  CountdownRestore,
  DecryptedSetupCacheRecord,
  DirectWipeEvent,
  ExecutionInFlightClaim,
  ExecutionInFlightRecord,
  ExpectedRevision,
  LandedRecoverySession,
  LandedStoredSession,
  ListedRecord,
  ListedRecoveryEntry,
  LiveRecoverySession,
  LiveStoredSession,
  RecordAccessor,
  RecordRead,
  RecoveryEntryAccessor,
  RecoveryEntryRecord,
  RecoverySessionAccessor,
  RecoverySessionRecord,
  RowNote,
  RowNotes,
  SaveInFlightAccessor,
  SaveInFlightClaim,
  SaveInFlightRecord,
  SessionRead,
  SessionRevision,
  SetupDraftRecord,
  SetupRecordName,
  SetupRecords,
  StoredCountdown,
  StoredWait,
  StoredRecord,
  StoredSession,
  SubmissionInFlightClaim,
  SubmissionInFlightRecord,
  WaitingPeriodRecord,
  WalletRecords,
  WalletRecordsOptions
} from './types'

/** The prefix of every storage key the records use. */
export const RECORDS_KEY_PREFIX = 'socialRecovery'

/**
 * Whether a value is a chain id: a bigint that is not negative, or a number
 * that is a safe integer and not negative, so it keeps every digit.
 */
const isChainId = (value: unknown): value is ChainId =>
  (typeof value === 'bigint' && value >= 0n) ||
  (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)

const chainPart = (chainId: ChainId | string): string => {
  const text = String(chainId)
  if ((typeof chainId !== 'string' && !isChainId(chainId)) || !/^[0-9]+$/.test(text)) {
    throw new Error(`Invalid chain id: ${text}`)
  }
  return text
}

const accountPart = (account: Address): string => {
  if (!isAddress(account, { strict: false })) {
    throw new Error(`Invalid account address: ${String(account)}`)
  }
  return account.toLowerCase()
}

/** A request id as the ceremony tab's route carries it: letters, digits, `_` and `-`. */
const requestIdPart = (id: string): string => {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw new Error(`Invalid request id: ${id}`)
  }
  return id
}

/**
 * A fresh request id for a ceremony request: 32 hex digits from the platform's
 * random source, an id the ceremony tab's route carries. Request ids are
 * global, so a caller takes a new one for each ceremony it asks for; a retry
 * of the same ceremony may write under the same id again.
 */
export const newCeremonyRequestId = (): string =>
  bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(16))).slice(2)

/** The key prefix every recovery session on one chain shares. */
const recoverySessionPrefix = (chainId: ChainId): string =>
  `${RECORDS_KEY_PREFIX}:recoverySession:${chainPart(chainId)}:`

/** The key prefix every recovery entry on one chain shares. */
const recoveryEntryPrefix = (chainId: ChainId): string =>
  `${RECORDS_KEY_PREFIX}:recoveryEntry:${chainPart(chainId)}:`

/**
 * The storage keys, `socialRecovery:<record>:<chainId>:<account>` with the
 * account in lowercase, so a write for one account never touches another:
 *
 * - `setupDraft`, `inventory`, `path`, `enrollments`, `waitingPeriod` and
 *   `passwordSet`: the six setup records;
 * - `recoverySession`: the live gathering, the reason line a wipe leaves, or in
 *   its landed state the countdown's record;
 * - `recoveryEntry`: the route and the receiving account of a recovery;
 * - `decryptedSetupCache`: the setup the recovery password unlocked;
 * - `saveInFlight`: the setup save sent to the wallet and not yet settled;
 * - `watcher`: the watcher's last reading of the account's attempt.
 *
 * A ceremony request is keyed by its request id alone,
 * `socialRecovery:ceremonyRequest:<id>`, since the ceremony tab reads it from
 * that id before it knows the account.
 */
export const recordKeys = {
  setup: (name: SetupRecordName, chainId: ChainId, account: Address): string =>
    `${RECORDS_KEY_PREFIX}:${name}:${chainPart(chainId)}:${accountPart(account)}`,
  recoverySession: (chainId: ChainId, account: Address): string =>
    `${recoverySessionPrefix(chainId)}${accountPart(account)}`,
  recoveryEntry: (chainId: ChainId, account: Address): string =>
    `${recoveryEntryPrefix(chainId)}${accountPart(account)}`,
  decryptedSetupCache: (chainId: ChainId, account: Address): string =>
    `${RECORDS_KEY_PREFIX}:decryptedSetupCache:${chainPart(chainId)}:${accountPart(account)}`,
  saveInFlight: (chainId: ChainId, account: Address): string =>
    `${RECORDS_KEY_PREFIX}:saveInFlight:${chainPart(chainId)}:${accountPart(account)}`,
  watcher: (chainId: ChainId, account: Address): string =>
    `${RECORDS_KEY_PREFIX}:watcher:${chainPart(chainId)}:${accountPart(account)}`,
  ceremonyRequest: (id: string): string =>
    `${RECORDS_KEY_PREFIX}:ceremonyRequest:${requestIdPart(id)}`
}

const isStoredRecord = (stored: unknown): stored is StoredRecord<unknown> => {
  if (typeof stored !== 'object' || stored === null || !('value' in stored)) {
    return false
  }
  const { savedAt } = stored as { savedAt?: unknown }
  return typeof savedAt === 'number' && Number.isFinite(savedAt)
}

const SESSION_STATES = ['live', 'wiped', 'landed']

const isSessionRecord = (value: unknown): value is RecoverySessionRecord =>
  typeof value === 'object' &&
  value !== null &&
  SESSION_STATES.includes((value as { state?: unknown }).state as string)

const isStoredSession = (stored: unknown): stored is StoredSession => {
  if (!isStoredRecord(stored) || !isSessionRecord(stored.value)) {
    return false
  }
  const { revision } = stored as { revision?: unknown }
  return typeof revision === 'string' && revision !== ''
}

/** An entry as a read hands it out: deployment fields that are not two addresses read as none. */
const entryAsRead = ({ deployment, ...entry }: RecoveryEntryRecord): RecoveryEntryRecord => {
  const read = recordDeploymentFrom(deployment)
  return { ...entry, ...(read ? { deployment: read } : {}) }
}

/**
 * Whether a stored value is a recovery entry: the account, one of the two
 * routes and the receiving account.
 */
const isRecoveryEntry = (value: unknown): value is RecoveryEntryRecord => {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    isStoredAddress(record.account) &&
    RECOVERY_ROUTES.some((route) => route === record.route) &&
    isStoredAddress(record.receivingAccount)
  )
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Whether a stored value is a credential: its method address, its config and,
 * where present, its label and salt.
 */
const isStoredCredential = (value: unknown): value is Credential =>
  isPlainObject(value) &&
  isStoredAddress(value.method) &&
  isHex(value.config) &&
  (value.label === undefined || typeof value.label === 'string') &&
  (value.salt === undefined || isHex(value.salt))

/**
 * Whether a stored value is a ceremony request: its account, chain and method,
 * and what its call needs, an enrollment's method address and params, with the
 * credential it replaces or null where it has one, or a test's or a claim's
 * request, with the method's params where it has them.
 */
const isCeremonyRequest = (value: unknown): value is CeremonyRequestRecord => {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  if (
    !isStoredAddress(record.account) ||
    !isChainId(record.chainId) ||
    typeof record.method !== 'string'
  ) {
    return false
  }
  switch (record.call) {
    case 'enroll':
      return (
        isStoredAddress(record.methodAddress) &&
        isPlainObject(record.params) &&
        (record.replaces === undefined ||
          record.replaces === null ||
          isStoredCredential(record.replaces))
      )
    case 'testAccess':
    case 'createClaim':
      return (
        typeof record.request === 'object' &&
        record.request !== null &&
        (record.params === undefined || isPlainObject(record.params))
      )
    case 'healthCheck':
      return true
    default:
      return false
  }
}

/**
 * Whether a stored value is a save in flight: a draft, a prepared call or
 * batch, the request id, the claim time and, where present, the hash, the
 * time of its first write and the start block.
 */
const isSaveInFlight = (value: unknown): value is SaveInFlightRecord => {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  const prepared = record.prepared as { kind?: unknown } | null | undefined
  return (
    typeof record.draft === 'object' &&
    record.draft !== null &&
    typeof prepared === 'object' &&
    prepared !== null &&
    (prepared.kind === 'call' || prepared.kind === 'batch') &&
    typeof record.requestId === 'string' &&
    record.requestId !== '' &&
    typeof record.claimedAt === 'number' &&
    Number.isFinite(record.claimedAt) &&
    (record.transactionHash === undefined || typeof record.transactionHash === 'string') &&
    (record.sentAt === undefined ||
      (typeof record.sentAt === 'number' && Number.isFinite(record.sentAt))) &&
    (record.startBlock === undefined ||
      (Number.isSafeInteger(record.startBlock) && (record.startBlock as number) >= 0))
  )
}

/**
 * Whether a stored value is a submission in flight: the request id, the start
 * block, the claim time and, where present, the hash.
 */
const isSubmissionInFlight = (value: unknown): value is SubmissionInFlightRecord => {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.requestId === 'string' &&
    record.requestId !== '' &&
    Number.isSafeInteger(record.startBlock) &&
    (record.startBlock as number) >= 0 &&
    typeof record.claimedAt === 'number' &&
    Number.isFinite(record.claimedAt) &&
    (record.transactionHash === undefined || typeof record.transactionHash === 'string')
  )
}

/** Whether a stored value is an execution in flight: the same shape as a submission in flight. */
const isExecutionInFlight = (value: unknown): value is ExecutionInFlightRecord =>
  isSubmissionInFlight(value)

/** A stored wait as the number of seconds the SDK takes. */
const waitAsRead = (wait: StoredWait): number => (typeof wait === 'bigint' ? Number(wait) : wait)

/** A stored record that carries a wait, with the wait as a number. */
const withWaitAsRead = <T extends { wait: StoredWait }>(value: T): T & { wait: number } => ({
  ...value,
  wait: waitAsRead(value.wait)
})

/**
 * Whether a stored credential holds code, read from a value the storage
 * holds: a record stored before the status was kept reads as a credential with
 * no code, the answer for every credential whose code was not read.
 */
const holdsCodeAsRead = (value: { credentialHoldsCode?: unknown }): boolean =>
  value.credentialHoldsCode === true

/** A stored place with its credential's code status. */
const placeAsRead = (place: GatheringPlace): GatheringPlace => ({
  ...place,
  credentialHoldsCode: holdsCodeAsRead(place)
})

/** A stored gathering whose places are a list, each with its credential's code status. */
const gatheringAsRead = (gathering: Gathering): Gathering => ({
  ...gathering,
  places: gathering.places.map(placeAsRead)
})

/** A stored request with its credential's code status. */
const requestAsRead = (request: ApproverRequest): ApproverRequest => ({
  ...request,
  credentialHoldsCode: holdsCodeAsRead(request)
})

/** A stored ceremony request, its access test's or claim's request with its code status. */
const ceremonyRequestAsRead = (value: CeremonyRequestRecord): CeremonyRequestRecord =>
  value.call === 'testAccess' || value.call === 'createClaim'
    ? { ...value, request: requestAsRead(value.request) }
    : value

/**
 * Deep equality of a stored request and the request a write names, as the
 * storage keeps them: both pass through the rich JSON the storage writes, so a
 * key whose value is `undefined` counts as absent on both sides. The storage
 * read checks the session's state and not its gathering, so a stored request
 * may be missing, and a missing one is never equal.
 */
const sameStoredValue = (
  stored: Gathering['request'] | undefined,
  named: Gathering['request']
): boolean => stored !== undefined && isEqual(parse(stringify(stored)), parse(stringify(named)))

/**
 * The notes a live session keeps for a gathering: the notes of the places the
 * gathering has, less every place that holds a reply, since a reply answers
 * the note. `undefined` where none is left, so the session stores no empty
 * member.
 */
const notesKept = (notes: RowNotes | undefined, gathering: Gathering): RowNotes | undefined => {
  if (!notes) {
    return undefined
  }
  const replied = new Set(gathering.replies.map((reply) => reply.place))
  const kept = gathering.places.flatMap(({ place }) => {
    const note = notes[place]
    return note !== undefined && ROW_NOTES.includes(note) && !replied.has(place)
      ? [[place, note] as const]
      : []
  })
  return kept.length ? Object.fromEntries(kept) : undefined
}

/**
 * The live session of a gathering, with no `notes` member where it has none
 * and no `submission` member where no submission is in flight.
 */
const liveSession = (
  gathering: Gathering,
  notes: RowNotes | undefined,
  submission: SubmissionInFlightRecord | undefined
): LiveRecoverySession => ({
  state: 'live',
  gathering,
  ...(notes ? { notes } : {}),
  ...(submission ? { submission } : {})
})

/** The landed session of a countdown, with no member where the countdown has none. */
const landedSession = ({
  account,
  attemptId,
  setupNonce,
  payloadHash,
  executableAt,
  execution,
  deployment
}: CountdownRecord): LandedRecoverySession => ({
  state: 'landed',
  account,
  ...(attemptId === undefined ? {} : { attemptId }),
  ...(setupNonce === undefined ? {} : { setupNonce }),
  ...(payloadHash === undefined ? {} : { payloadHash }),
  ...(executableAt === undefined ? {} : { executableAt }),
  ...(execution === undefined ? {} : { execution }),
  ...(deployment === undefined ? {} : { deployment })
})

/** The countdown a landed session holds: everything but its state. */
const countdownOf = ({ state, ...countdown }: LandedRecoverySession): CountdownRecord => countdown

/** A stored landed session as the stored countdown it holds. */
const storedCountdownOf = ({ value, savedAt, revision }: LandedStoredSession): StoredCountdown => ({
  value: countdownOf(value),
  savedAt,
  revision
})

/**
 * A landed session as a read hands it out: the account, and the attempt's
 * fields and the execution in flight only where each is well formed, so a
 * session stored before they were kept, or a damaged member, reads without it.
 */
const landedAsRead = (value: LandedRecoverySession): LandedRecoverySession =>
  landedSession({
    account: value.account,
    attemptId: isDecimalString(value.attemptId) ? value.attemptId : undefined,
    setupNonce: isDecimalString(value.setupNonce) ? value.setupNonce : undefined,
    payloadHash: typeof value.payloadHash === 'string' ? value.payloadHash : undefined,
    executableAt: isStoredSeconds(value.executableAt) ? value.executableAt : undefined,
    execution: isExecutionInFlight(value.execution) ? value.execution : undefined,
    deployment: recordDeploymentFrom(value.deployment)
  })

/**
 * The landed session a live session's request leaves: the account, its
 * attempt id and setup nonce, and the keccak256 of its payload, each where
 * the stored request holds it well formed, and when the attempt becomes
 * executable where the landing read it.
 */
const landedFrom = (
  request: Gathering['request'],
  executableAt: number | undefined
): LandedRecoverySession =>
  landedAsRead({
    state: 'landed',
    account: request.account,
    attemptId: request.attemptId,
    setupNonce: request.setupNonce,
    payloadHash:
      'payload' in request && isHex(request.payload) ? keccak256(request.payload) : undefined,
    executableAt,
    deployment: recordDeploymentFrom(request)
  })

/**
 * A stored session as a read hands it out: a live session keeps only the notes
 * its gathering allows, and its submission in flight where that is one; a
 * landed session keeps only its well-formed members. A stored gathering whose
 * places or replies are not lists keeps no notes and still reads, so a wipe or
 * a new write can replace it.
 */
const sessionAsRead = (value: RecoverySessionRecord): RecoverySessionRecord => {
  if (value.state === 'landed') {
    return landedAsRead(value)
  }
  if (value.state !== 'live') {
    const { deployment, ...wiped } = value
    const read = recordDeploymentFrom(deployment)
    return { ...wiped, ...(read ? { deployment: read } : {}) }
  }
  const { gathering } = value
  const submission = isSubmissionInFlight(value.submission) ? value.submission : undefined
  if (!Array.isArray(gathering.places) || !Array.isArray(gathering.replies)) {
    return liveSession(gathering, undefined, submission)
  }
  const read = gatheringAsRead(gathering)
  return liveSession(read, notesKept(value.notes, read), submission)
}

const newRevision = (): SessionRevision =>
  bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(12)))

// The fallback queue, one per key: used only where the Web Locks API is missing,
// and it spans this JS context alone.
const queues = new Map<string, Promise<void>>()

const inMemoryQueue = <R>(key: string, task: () => Promise<R>): Promise<R> => {
  const run = (queues.get(key) ?? Promise.resolve()).then(task)
  const settled = run.then(
    () => undefined,
    () => undefined
  )
  queues.set(key, settled)
  settled
    .then(() => {
      if (queues.get(key) === settled) {
        queues.delete(key)
      }
    })
    .catch(() => undefined)
  return run
}

/**
 * Runs one update of a key after the previous update of that key has settled,
 * so its read and its write never interleave with another update of the same
 * key. It holds the Web Locks lock named by the key, which every extension page
 * and the worker share, or where that API is missing the in-memory queue of
 * the key. A task must never start another update of its own key: the same
 * holder cannot take a Web Locks lock twice, and the in-memory queue would
 * wait for itself.
 */
export const inQueue = <R>(key: string, task: () => Promise<R>): Promise<R> => {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  if (locks) {
    return locks.request(key, () => task()) as Promise<R>
  }
  return inMemoryQueue(key, task)
}

/**
 * Runs one update that spans several keys while it holds the queue of each,
 * taken one after another in the order given, so no single-key update of any
 * of them interleaves with it. Every caller passes its setup keys in the order
 * of `SETUP_RECORD_NAMES` and the save in flight's key after them, the
 * recoverer's abandon and the countdown's restore pass the session's key and
 * the recovery entry's key after it, and a single-key update holds one key
 * alone. An update can wait
 * for another that holds a key it needs, but never for one that waits for a
 * key it holds, so the waits never form a cycle.
 */
const inQueues = <R>(keys: readonly string[], task: () => Promise<R>): Promise<R> =>
  keys.reduceRight<() => Promise<R>>((inner, key) => () => inQueue(key, inner), task)()

/**
 * The refusal of a recovery session update whose caller read an older
 * revision: another update changed the session after that read, and nothing
 * was written. A retry reads the session again. Only while that fresh read is
 * live does the caller re-apply its change to the fresh gathering and pass the
 * fresh revision; in every other state the change is void. Writing the old
 * in-memory gathering with the fresh revision would bring wiped approvals back.
 */
export class SessionRevisionConflict extends Error {
  constructor(key: string) {
    super(
      `The recovery session ${key} changed after it was read. Read it again: re-apply the change to the fresh read only while it is live; in any other state the change is void`
    )
    this.name = 'SessionRevisionConflict'
    // Keeps `instanceof` working where the build compiles classes to functions.
    Object.setPrototypeOf(this, SessionRevisionConflict.prototype)
  }
}

export const isSessionRevisionConflict = (error: unknown): error is SessionRevisionConflict =>
  error instanceof SessionRevisionConflict

/**
 * The refusal of a start over while a setup save of the account is in flight:
 * the save may still land, so the setup records stay and nothing was removed.
 */
export class SaveInFlightRefusal extends Error {
  constructor(key: string) {
    super(`The setup save ${key} is in flight: start over waits until it settles`)
    this.name = 'SaveInFlightRefusal'
    // Keeps `instanceof` working where the build compiles classes to functions.
    Object.setPrototypeOf(this, SaveInFlightRefusal.prototype)
  }
}

export const isSaveInFlightRefusal = (error: unknown): error is SaveInFlightRefusal =>
  error instanceof SaveInFlightRefusal

/** The revision an update passes after this read: the read's revision, or `null` when absent. */
export const revisionOf = (read: SessionRead | CountdownRead): ExpectedRevision =>
  read.status === 'present' ? read.revision : null

/** The age of a read record in milliseconds at `at`, or `null` for an absent record. */
export const recordAge = <T>(read: RecordRead<T>, at: number): number | null =>
  read.status === 'present' ? at - read.savedAt : null

/** The account a session record names, in any state. */
export const sessionAccount = (session: RecoverySessionRecord): Address =>
  session.state === 'live' ? session.gathering.request.account : session.account

/** The attempt id the live session's request was built against (the predicted attempt id). */
export const predictedAttemptId = (session: LiveRecoverySession): bigint =>
  BigInt(session.gathering.request.attemptId)

export const createWalletRecords = ({
  storage,
  now = Date.now
}: WalletRecordsOptions): WalletRecords => {
  const readKey = async <T>(key: string): Promise<RecordRead<T>> => {
    const stored: unknown = await storage.get(key, undefined)
    if (!isStoredRecord(stored)) {
      return ABSENT
    }
    return { status: 'present', value: stored.value as T, savedAt: stored.savedAt }
  }

  const writeKey = async <T>(key: string, value: T): Promise<StoredRecord<T>> => {
    const record: StoredRecord<T> = { value, savedAt: now() }
    await storage.set(key, record)
    return record
  }

  const removeKey = (key: string): Promise<void> =>
    inQueue(key, async () => {
      await storage.remove(key)
    })

  const accessor = <T>(
    key: string,
    asRead: (value: T) => T = (value) => value
  ): RecordAccessor<T> => {
    const read = async (): Promise<RecordRead<T>> => {
      const stored = await readKey<T>(key)
      return stored.status === 'present' ? { ...stored, value: asRead(stored.value) } : stored
    }
    return {
      read,
      write: (value: T) => inQueue(key, () => writeKey<T>(key, value)),
      wipe: () => removeKey(key),
      age: async (at?: number) => recordAge(await read(), at ?? now())
    }
  }

  /**
   * The save in flight stored under a key. A stored value that is not a save in
   * flight reads absent.
   */
  const readSaveInFlight = async (key: string): Promise<RecordRead<SaveInFlightRecord>> => {
    const stored: unknown = await storage.get(key, undefined)
    if (!isStoredRecord(stored) || !isSaveInFlight(stored.value)) {
      return ABSENT
    }
    return {
      status: 'present',
      value: { ...stored.value, draft: withWaitAsRead(stored.value.draft) },
      savedAt: stored.savedAt
    }
  }

  // --- the six setup records -----------------------------------------------

  /**
   * The six setup records of an account: the setup draft, the inventory, the
   * path, the enrollments, the waiting period and the password-set flag.
   */
  const setup = (chainId: ChainId, account: Address): SetupRecords => {
    const draftKey = recordKeys.setup('setupDraft', chainId, account)
    const pathKey = recordKeys.setup('path', chainId, account)
    return {
      setupDraft: accessor<SetupDraftRecord>(draftKey, withWaitAsRead),
      inventory: accessor(recordKeys.setup('inventory', chainId, account)),
      path: accessor(pathKey),
      enrollments: accessor(recordKeys.setup('enrollments', chainId, account)),
      waitingPeriod: accessor<WaitingPeriodRecord>(
        recordKeys.setup('waitingPeriod', chainId, account),
        waitAsRead
      ),
      passwordSet: accessor(recordKeys.setup('passwordSet', chainId, account)),
      writeDraftAndPath: (draft: SetupDraftRecord) =>
        inQueues([draftKey, pathKey], async () => {
          const savedAt = now()
          const written = {
            setupDraft: { value: draft, savedAt },
            path: { value: draft.clauses, savedAt }
          }
          await storage.setEntries({ [draftKey]: written.setupDraft, [pathKey]: written.path })
          return written
        })
    }
  }

  /**
   * The latest `savedAt` of the six setup records, the draft's age a resumed
   * wizard shows, or `null` when none is stored.
   */
  const setupSavedAt = async (chainId: ChainId, account: Address): Promise<number | null> => {
    const reads = await Promise.all(
      SETUP_RECORD_NAMES.map((name) => readKey<unknown>(recordKeys.setup(name, chainId, account)))
    )
    const times = reads.flatMap((read) => (read.status === 'present' ? [read.savedAt] : []))
    return times.length ? Math.max(...times) : null
  }

  /**
   * The setup landed on chain: wipes the six setup records and the save in
   * flight in one storage call, so a saved setup leaves no record behind. The
   * recovery password held in memory stays for the tab's life, so the Recovery
   * Card can show it. Platform credentials are untouched.
   */
  const saveSetup = async (chainId: ChainId, account: Address): Promise<void> => {
    const keys = [
      ...SETUP_RECORD_NAMES.map((name) => recordKeys.setup(name, chainId, account)),
      recordKeys.saveInFlight(chainId, account)
    ]
    await inQueues(keys, () => storage.removeKeys(keys))
  }

  /**
   * The holder starts over: wipes the six setup records in one storage call,
   * then the recovery password held in memory, which no screen shows again.
   * While a save of the account is in flight it removes nothing and throws
   * `SaveInFlightRefusal`, since that save may still land. It takes the keys in
   * the order `saveSetup` takes them, the save in flight last, and reads that
   * record while it holds them all. Platform credentials are untouched.
   */
  const startOverSetup = async (chainId: ChainId, account: Address): Promise<void> => {
    const setupKeys = SETUP_RECORD_NAMES.map((name) => recordKeys.setup(name, chainId, account))
    const saveKey = recordKeys.saveInFlight(chainId, account)
    await inQueues([...setupKeys, saveKey], async () => {
      if ((await readSaveInFlight(saveKey)).status === 'present') {
        throw new SaveInFlightRefusal(saveKey)
      }
      await storage.removeKeys(setupKeys)
    })
    wipeRecoveryPassword(chainId, account)
  }

  // --- the recovery session ------------------------------------------------

  const readSessionAt = async (key: string): Promise<SessionRead> => {
    const stored: unknown = await storage.get(key, undefined)
    if (!isStoredSession(stored)) {
      return ABSENT
    }
    return {
      status: 'present',
      value: sessionAsRead(stored.value),
      savedAt: stored.savedAt,
      revision: stored.revision
    }
  }

  const writeSessionAt = async (
    key: string,
    value: RecoverySessionRecord,
    savedAt: number = now()
  ): Promise<StoredSession> => {
    const record: StoredSession = { value, savedAt, revision: newRevision() }
    await storage.set(key, record)
    return record
  }

  /** Runs `apply` on the stored session in its key's queue. */
  const inSessionQueue = async <R>(
    chainId: ChainId,
    account: Address,
    apply: (current: SessionRead, key: string) => Promise<R>
  ): Promise<R> => {
    const key = recordKeys.recoverySession(chainId, account)
    return inQueue(key, async () => apply(await readSessionAt(key), key))
  }

  const checkRevision = (current: SessionRead, expectedRevision: ExpectedRevision, key: string) => {
    if (revisionOf(current) !== expectedRevision) {
      throw new SessionRevisionConflict(key)
    }
  }

  /**
   * The stored live session of a read, or the refusal of an update that needs
   * one: an absent, wiped or landed session carries no gathering to act on.
   */
  const liveOrRefuse = (
    current: SessionRead,
    chainId: ChainId,
    account: Address
  ): LiveStoredSession => {
    if (current.status !== 'present' || current.value.state !== 'live') {
      throw new Error(`No live recovery session for ${account} on chain ${chainPart(chainId)}`)
    }
    return { value: current.value, savedAt: current.savedAt, revision: current.revision }
  }

  /**
   * Runs one update of a recovery session in its key's queue: reads the stored
   * session, throws `SessionRevisionConflict` when its revision is not the one
   * the caller read, and otherwise hands the read to `apply`.
   */
  const updateSession = <R>(
    chainId: ChainId,
    account: Address,
    expectedRevision: ExpectedRevision,
    apply: (current: SessionRead, key: string) => Promise<R>
  ): Promise<R> =>
    inSessionQueue(chainId, account, async (current, key) => {
      checkRevision(current, expectedRevision, key)
      return apply(current, key)
    })

  /**
   * The recovery session of one account on one chain. Its live body is the
   * SDK's gathering; a write for another account touches another key and never
   * wipes this one.
   */
  const recoverySession = (chainId: ChainId, account: Address): RecoverySessionAccessor => {
    const key = recordKeys.recoverySession(chainId, account)
    return {
      read: () => readSessionAt(key),
      write: async (gathering: Gathering, expectedRevision: ExpectedRevision) => {
        const { request } = gathering
        if (gathering.purpose !== 'approval') {
          throw new Error(
            `A recovery session holds an approval gathering, not ${gathering.purpose}`
          )
        }
        if (
          !isAddress(request.account, { strict: false }) ||
          !isAddressEqual(request.account, account)
        ) {
          throw new Error(`The gathering names account ${request.account}, not ${account}`)
        }
        if (chainPart(request.chainId) !== chainPart(chainId)) {
          throw new Error(`The gathering names chain ${request.chainId}, not ${chainPart(chainId)}`)
        }
        return updateSession(chainId, account, expectedRevision, async (current) => {
          // A session of another deployment, or one that names none, holds
          // nothing of this request: the write replaces it.
          const held =
            current.status === 'present' && isSessionOfDeployment(current.value, request)
              ? current.value
              : undefined
          if (held?.state === 'landed') {
            throw new Error(
              'A landed session holds the countdown: end it once its attempt ends, then gather again'
            )
          }
          const live = held?.state === 'live' ? held : undefined
          const notes = live ? notesKept(live.notes, gathering) : undefined
          if (live) {
            const stored = live.gathering
            // A new request would replace the gathering: that takes a wipe first.
            if (!sameStoredValue(stored.request, request)) {
              throw new Error(
                'A live session holds another request: wipe it with one of the five events first'
              )
            }
            // A later reply for the same place may displace a stored reply; no reply is dropped.
            const places = new Set(gathering.replies.map((reply) => reply.place))
            // Stored replies that are not a list hold no reply to keep.
            const storedReplies = Array.isArray(stored.replies) ? stored.replies : []
            const dropped = storedReplies.filter((reply) => !places.has(reply.place))
            if (dropped.length) {
              throw new Error(
                `The write drops the reply at place ${dropped
                  .map((reply) => reply.place)
                  .join(', ')}`
              )
            }
          }
          return writeSessionAt(key, liveSession(gathering, notes, live?.submission))
        })
      },
      setNote: (place: number, note: RowNote | null, expectedRevision: ExpectedRevision) =>
        updateSession(chainId, account, expectedRevision, async (current) => {
          if (current.status !== 'present' || current.value.state !== 'live') {
            throw new Error(
              `No live recovery session for ${account} on chain ${chainPart(chainId)}`
            )
          }
          const { gathering, notes = {}, submission } = current.value
          if (!Array.isArray(gathering.places) || !Array.isArray(gathering.replies)) {
            throw new Error(
              'The stored gathering holds no list of places or replies: write a new gathering or wipe the session first'
            )
          }
          if (!gathering.places.some((entry) => entry.place === place)) {
            throw new Error(`The gathering has no place ${place}`)
          }
          if (note !== null && gathering.replies.some((reply) => reply.place === place)) {
            throw new Error(`The place ${place} holds a reply, which answers any note`)
          }
          if ((notes[place] ?? null) === note) {
            return { value: current.value, savedAt: current.savedAt, revision: current.revision }
          }
          const others = Object.fromEntries(
            Object.entries(notes).filter(([noted]) => Number(noted) !== place)
          )
          const next = notesKept(note === null ? others : { ...others, [place]: note }, gathering)
          return writeSessionAt(key, liveSession(gathering, next, submission))
        }),
      claimSubmission: (claim: SubmissionInFlightClaim, expectedRevision: ExpectedRevision) =>
        updateSession(chainId, account, expectedRevision, async (current) => {
          const stored = liveOrRefuse(current, chainId, account)
          const live = stored.value
          if (live.submission) {
            return { claimed: false, submission: live.submission, record: stored }
          }
          const submission: SubmissionInFlightRecord = {
            requestId: claim.requestId,
            startBlock: claim.startBlock,
            claimedAt: claim.claimedAt
          }
          const record = await writeSessionAt(
            key,
            liveSession(live.gathering, live.notes, submission)
          )
          return { claimed: true, submission, record }
        }),
      setSubmissionHash: (
        requestId: string,
        transactionHash: Hex,
        expectedRevision: ExpectedRevision
      ) =>
        updateSession(chainId, account, expectedRevision, async (current) => {
          const stored = liveOrRefuse(current, chainId, account)
          const live = stored.value
          const { submission } = live
          if (!submission || submission.requestId !== requestId) {
            throw new Error(`No submission in flight under request ${requestId}: ${key}`)
          }
          if (submission.transactionHash === transactionHash) {
            return stored
          }
          return writeSessionAt(
            key,
            liveSession(live.gathering, live.notes, { ...submission, transactionHash })
          )
        }),
      releaseSubmission: (requestId: string, expectedRevision: ExpectedRevision) =>
        inSessionQueue(chainId, account, async (current) => {
          if (
            current.status !== 'present' ||
            current.value.state !== 'live' ||
            current.value.submission?.requestId !== requestId
          ) {
            return current
          }
          checkRevision(current, expectedRevision, key)
          const { gathering, notes } = current.value
          const written = await writeSessionAt(key, liveSession(gathering, notes, undefined))
          return { status: 'present' as const, ...written }
        }),
      age: async (at?: number) => recordAge(await readSessionAt(key), at ?? now())
    }
  }

  /** Every session record stored on a chain, by a prefix scan over the storage's entries. */
  const scanSessions = async (chainId: ChainId): Promise<ListedRecord<RecoverySessionRecord>[]> => {
    if (!storage.getAll) {
      throw new Error('This storage cannot list its entries: it has no getAll')
    }
    const prefix = recoverySessionPrefix(chainId)
    const entries = Object.entries(await storage.getAll())
      .filter(
        ([key]) => key.startsWith(prefix) && isAddress(key.slice(prefix.length), { strict: false })
      )
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return entries.flatMap(([, stored]) =>
      isStoredSession(stored)
        ? [
            {
              account: sessionAccount(stored.value),
              record: {
                value: sessionAsRead(stored.value),
                savedAt: stored.savedAt,
                revision: stored.revision
              }
            }
          ]
        : []
    )
  }

  /** Every recovery session stored on a chain, live, wiped or landed, for the home surface. */
  const listRecoverySessions = (chainId: ChainId) => scanSessions(chainId)

  // --- the recovery entry --------------------------------------------------

  const readEntryAt = async (key: string): Promise<RecordRead<RecoveryEntryRecord>> => {
    const stored: unknown = await storage.get(key, undefined)
    if (!isStoredRecord(stored) || !isRecoveryEntry(stored.value)) {
      return ABSENT
    }
    return { status: 'present', value: entryAsRead(stored.value), savedAt: stored.savedAt }
  }

  /**
   * The recovery entry of one account on one chain: the route the recoverer
   * came by and the account whose key receives control. The session's wipes
   * and its landing leave it, except the recoverer's abandon. A stored value
   * that is not an entry reads absent.
   */
  const recoveryEntry = (chainId: ChainId, account: Address): RecoveryEntryAccessor => {
    const key = recordKeys.recoveryEntry(chainId, account)
    return {
      read: () => readEntryAt(key),
      write: async (value: RecoveryEntryRecord) => {
        if (!isAddressEqual(value.account, account)) {
          throw new Error(`Invalid recovery entry, not written: ${key}`)
        }
        const entry: RecoveryEntryRecord = {
          account: value.account,
          route: value.route,
          receivingAccount: value.receivingAccount,
          ...(value.deployment ? { deployment: recordDeploymentOf(value.deployment) } : {})
        }
        return inQueue(key, () => writeKey<RecoveryEntryRecord>(key, entry))
      },
      clear: () => removeKey(key)
    }
  }

  /** Every recovery entry stored on a chain, by a prefix scan over the storage's entries. */
  const listRecoveryEntries = async (chainId: ChainId): Promise<ListedRecoveryEntry[]> => {
    if (!storage.getAll) {
      throw new Error('This storage cannot list its entries: it has no getAll')
    }
    const prefix = recoveryEntryPrefix(chainId)
    return Object.entries(await storage.getAll())
      .filter(
        ([key]) => key.startsWith(prefix) && isAddress(key.slice(prefix.length), { strict: false })
      )
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .flatMap(([, stored]) =>
        isStoredRecord(stored) && isRecoveryEntry(stored.value)
          ? [
              {
                account: stored.value.account,
                record: { value: entryAsRead(stored.value), savedAt: stored.savedAt }
              }
            ]
          : []
      )
  }

  /**
   * One of four events wipes a live recovery session: the deadline passed,
   * another attempt opened, the setup changed or the recoverer abandoned. The
   * gathering, with its replies, its row notes, its submission in flight and
   * its attempt id, is deleted, and the session keeps the reason, the account
   * and, for `deadline-passed`, the deadline. The recoverer's abandon ends the
   * recovery, so it also removes the account's recovery entry; the other three
   * events leave it. Returns whether it wiped anything: an absent, wiped or
   * landed session is left unchanged, and so is the entry, except that an
   * abandon of a session an abandon already wiped removes the entry that
   * abandon left.
   * `submission-landed` runs through `landSubmission`, and a security stop or a
   * pause is no wipe event. Throws `SessionRevisionConflict`
   * when the session changed after the caller read `expectedRevision`.
   */
  const wipeRecoverySession = (
    chainId: ChainId,
    account: Address,
    event: DirectWipeEvent,
    expectedRevision: ExpectedRevision
  ): Promise<boolean> => {
    const key = recordKeys.recoverySession(chainId, account)
    const entryKey = recordKeys.recoveryEntry(chainId, account)
    const abandons = event === 'recoverer-abandoned'
    return inQueues(abandons ? [key, entryKey] : [key], async () => {
      const current = await readSessionAt(key)
      checkRevision(current, expectedRevision, key)
      if (current.status !== 'present' || current.value.state !== 'live') {
        // An abandon cut off between its two calls left the entry: this one ends it.
        if (
          abandons &&
          current.status === 'present' &&
          current.value.state === 'wiped' &&
          current.value.reason === 'recoverer-abandoned'
        ) {
          await storage.remove(entryKey)
        }
        return false
      }
      const { request } = current.value.gathering
      const deployment = recordDeploymentFrom(request)
      await writeSessionAt(key, {
        state: 'wiped',
        reason: event,
        account: request.account,
        ...(event === 'deadline-passed' ? { deadline: request.validUntil } : {}),
        ...(deployment ? { deployment } : {})
      })
      // The session is written first, so an interruption between the two calls
      // leaves the state every other wipe leaves, never a live session without
      // its entry.
      if (abandons) {
        await storage.remove(entryKey)
      }
      return true
    })
  }

  /**
   * Writes a landed session and answers it as the stored countdown. The landing
   * itself stamps a new `savedAt`; a later write of the same countdown passes
   * the landing's, so the countdown's start date stays the landing's time.
   */
  const writeLandedAt = async (
    key: string,
    landed: LandedRecoverySession,
    savedAt?: number
  ): Promise<StoredCountdown> => {
    const written = await writeSessionAt(key, landed, savedAt)
    return { value: countdownOf(landed), savedAt: written.savedAt, revision: written.revision }
  }

  /**
   * The submission landed: the live session survives as the countdown's record,
   * the account with the landed request's attempt id, setup nonce and payload
   * hash, and when the attempt becomes executable, written in one set in place of the live session, so the gathering,
   * its replies and its submission in flight are gone in the same write.
   * Refuses when no live session exists, and throws `SessionRevisionConflict`
   * when the session changed after the caller read `expectedRevision`.
   */
  const landSubmission = async (
    chainId: ChainId,
    account: Address,
    expectedRevision: ExpectedRevision,
    executableAt?: number
  ) =>
    updateSession(chainId, account, expectedRevision, async (current, key) => {
      if (current.status !== 'present' || current.value.state !== 'live') {
        throw new Error(`No live recovery session for ${account} on chain ${chainPart(chainId)}`)
      }
      return writeLandedAt(key, landedFrom(current.value.gathering.request, executableAt))
    })

  // A session in another state, or no session, returns false with no revision
  // check, so a caller whose read found no such session never meets a conflict.
  const removeSessionIn = (
    chainId: ChainId,
    account: Address,
    state: 'wiped' | 'landed',
    expectedRevision: ExpectedRevision
  ): Promise<boolean> =>
    inSessionQueue(chainId, account, async (current, key) => {
      if (current.status !== 'present' || current.value.state !== state) {
        return false
      }
      checkRevision(current, expectedRevision, key)
      await storage.remove(key)
      return true
    })

  /**
   * Removes a session record in its wiped state, once its death screen is read,
   * so old sessions do not accumulate, and returns true. In any other state, or
   * with no session, it touches nothing and returns false whatever the
   * revision, so a live session and a running countdown stay. On a wiped
   * session it throws `SessionRevisionConflict` when the stored revision is not
   * `expectedRevision`.
   */
  const clearWipedSession = async (
    chainId: ChainId,
    account: Address,
    expectedRevision: ExpectedRevision
  ): Promise<boolean> => removeSessionIn(chainId, account, 'wiped', expectedRevision)

  /**
   * Removes a session record in its landed state, once the attempt it counts
   * down to has ended (executed or cancelled), and returns true. In any other
   * state, or with no session, it touches nothing and returns false whatever
   * the revision. On a landed session it throws `SessionRevisionConflict` when
   * the stored revision is not `expectedRevision`.
   */
  const endCountdown = async (
    chainId: ChainId,
    account: Address,
    expectedRevision: ExpectedRevision
  ): Promise<boolean> => removeSessionIn(chainId, account, 'landed', expectedRevision)

  // --- the countdown -------------------------------------------------------

  const asCountdown = (read: SessionRead): CountdownRead =>
    read.status === 'present' && read.value.state === 'landed'
      ? {
          status: 'present',
          value: countdownOf(read.value),
          savedAt: read.savedAt,
          revision: read.revision
        }
      : ABSENT

  /**
   * The stored landed session of a read, or the refusal of an update that
   * needs one: an absent, live or wiped session holds no countdown to act on.
   */
  const landedOrRefuse = (
    current: SessionRead,
    chainId: ChainId,
    account: Address
  ): LandedStoredSession => {
    if (current.status !== 'present' || current.value.state !== 'landed') {
      throw new Error(`No landed recovery session for ${account} on chain ${chainPart(chainId)}`)
    }
    return { value: current.value, savedAt: current.savedAt, revision: current.revision }
  }

  /**
   * The countdown's record of one account: the session in its landed state,
   * with the landed attempt's fields and the execution in flight it carries.
   */
  const countdown = (chainId: ChainId, account: Address): CountdownAccessor => {
    const key = recordKeys.recoverySession(chainId, account)
    return {
      read: async () => asCountdown(await readSessionAt(key)),
      claimExecution: (claim: ExecutionInFlightClaim, expectedRevision: ExpectedRevision) =>
        updateSession(chainId, account, expectedRevision, async (current) => {
          const stored = landedOrRefuse(current, chainId, account)
          const landed = stored.value
          if (landed.execution) {
            return {
              claimed: false,
              execution: landed.execution,
              record: storedCountdownOf(stored)
            }
          }
          const execution: ExecutionInFlightRecord = {
            requestId: claim.requestId,
            startBlock: claim.startBlock,
            claimedAt: claim.claimedAt
          }
          const record = await writeLandedAt(
            key,
            landedSession({ ...countdownOf(landed), execution }),
            stored.savedAt
          )
          return { claimed: true, execution, record }
        }),
      setExecutionHash: (
        requestId: string,
        transactionHash: Hex,
        expectedRevision: ExpectedRevision
      ) =>
        updateSession(chainId, account, expectedRevision, async (current) => {
          const stored = landedOrRefuse(current, chainId, account)
          const landed = stored.value
          const { execution } = landed
          if (!execution || execution.requestId !== requestId) {
            throw new Error(`No execution in flight under request ${requestId}: ${key}`)
          }
          if (execution.transactionHash === transactionHash) {
            return storedCountdownOf(stored)
          }
          return writeLandedAt(
            key,
            landedSession({ ...countdownOf(landed), execution: { ...execution, transactionHash } }),
            stored.savedAt
          )
        }),
      releaseExecution: (requestId: string, expectedRevision: ExpectedRevision) =>
        inSessionQueue(chainId, account, async (current) => {
          if (
            current.status !== 'present' ||
            current.value.state !== 'landed' ||
            current.value.execution?.requestId !== requestId
          ) {
            return asCountdown(current)
          }
          checkRevision(current, expectedRevision, key)
          const written = await writeLandedAt(
            key,
            landedSession({ ...countdownOf(current.value), execution: undefined }),
            current.savedAt
          )
          return { status: 'present' as const, ...written }
        }),
      age: async (at?: number) => recordAge(asCountdown(await readSessionAt(key)), at ?? now())
    }
  }

  /**
   * Keeps the countdown of an attempt found running on chain where the wait
   * reads it, so a recoverer whose own session is gone follows the attempt
   * the chain holds. It holds the session's key and then the recovery entry's,
   * the order the recoverer's abandon takes them. A live session is kept and
   * so is the entry beside it. A landed session of the same deployment is
   * kept where it holds an execution in flight, where it is of the same
   * attempt (its id, its setup nonce and its payload's hash) or where it is of
   * a newer attempt (a greater id), and only the same attempt's gets the
   * entry. No session, a wiped one, the countdown of an older attempt or a
   * countdown of another deployment, with an execution in flight or not, is
   * replaced by the chain's, saved at the attempt's opening, and the entry is
   * written after it.
   */
  const restoreCountdown = (
    chainId: ChainId,
    account: Address,
    restored: ChainCountdown,
    entry?: Omit<RecoveryEntryRecord, 'account'>
  ): Promise<CountdownRestore> => {
    const key = recordKeys.recoverySession(chainId, account)
    const entryKey = recordKeys.recoveryEntry(chainId, account)
    const writeEntry = async () => {
      if (entry) {
        await writeKey<RecoveryEntryRecord>(entryKey, {
          account,
          route: entry.route,
          receivingAccount: entry.receivingAccount,
          deployment: recordDeploymentOf(restored.deployment)
        })
      }
    }
    return inQueues([key, entryKey], async (): Promise<CountdownRestore> => {
      const current = await readSessionAt(key)
      if (
        current.status === 'present' &&
        current.value.state === 'live' &&
        isSessionOfDeployment(current.value, restored.deployment)
      ) {
        return { outcome: 'kept', countdown: ABSENT }
      }
      if (current.status === 'present' && current.value.state === 'landed') {
        const session = current.value
        // A countdown of another deployment, or one that names none, says nothing of this attempt.
        const ours = isOfDeployment(session.deployment, restored.deployment)
        const same =
          ours &&
          session.attemptId === restored.attemptId.toString() &&
          session.setupNonce === restored.setupNonce.toString() &&
          session.payloadHash !== undefined &&
          session.payloadHash.toLowerCase() === restored.payloadHash.toLowerCase()
        // The registry's attempt counter only grows, so a stored attempt with
        // a greater id is the newer one.
        const newer =
          ours && session.attemptId !== undefined && BigInt(session.attemptId) > restored.attemptId
        if (same || newer || (ours && session.execution)) {
          if (same) {
            await writeEntry()
          }
          return { outcome: 'kept', countdown: asCountdown(current) }
        }
      }
      const written = await writeLandedAt(
        key,
        landedSession({
          account,
          attemptId: restored.attemptId.toString(),
          setupNonce: restored.setupNonce.toString(),
          payloadHash: restored.payloadHash,
          executableAt: restored.executableAt,
          deployment: recordDeploymentOf(restored.deployment)
        }),
        restored.openedAtMs
      )
      await writeEntry()
      return { outcome: 'written', countdown: { status: 'present', ...written } }
    })
  }

  /** Every countdown on a chain, the landed sessions, for the home surface. */
  const listCountdowns = async (chainId: ChainId): Promise<ListedRecord<CountdownRecord>[]> =>
    (await scanSessions(chainId)).flatMap(({ record }) =>
      record.value.state === 'landed'
        ? [
            {
              account: record.value.account,
              record: {
                value: countdownOf(record.value),
                savedAt: record.savedAt,
                revision: record.revision
              }
            }
          ]
        : []
    )

  // --- the decrypted setup cache -------------------------------------------

  /**
   * This device's cache of the setup the recovery password unlocked, with the
   * setup nonce and the deployment it was read under. It stays after the
   * recovery executes; no wipe of these records touches it. Deployment fields
   * that are not two addresses read as none.
   */
  const decryptedSetupCache = (
    chainId: ChainId,
    account: Address
  ): RecordAccessor<DecryptedSetupCacheRecord> =>
    accessor<DecryptedSetupCacheRecord>(
      recordKeys.decryptedSetupCache(chainId, account),
      ({ deployment, ...value }) => {
        const read = recordDeploymentFrom(deployment)
        return {
          ...value,
          configuration: withWaitAsRead(value.configuration),
          ...(read ? { deployment: read } : {})
        }
      }
    )

  // --- the ceremony request ------------------------------------------------

  /**
   * The ceremony request under one request id. A stored value that is not a
   * ceremony request reads absent, so the tab finds nothing to run under it.
   */
  const ceremonyRequest = (id: string): RecordAccessor<CeremonyRequestRecord> => {
    const key = recordKeys.ceremonyRequest(id)
    const read = async (): Promise<RecordRead<CeremonyRequestRecord>> => {
      const stored: unknown = await storage.get(key, undefined)
      if (!isStoredRecord(stored) || !isCeremonyRequest(stored.value)) {
        return ABSENT
      }
      return {
        status: 'present',
        value: ceremonyRequestAsRead(stored.value),
        savedAt: stored.savedAt
      }
    }
    return {
      read,
      write: (value: CeremonyRequestRecord) => inQueue(key, () => writeKey(key, value)),
      wipe: () => removeKey(key),
      age: async (at?: number) => recordAge(await read(), at ?? now())
    }
  }

  // --- the save in flight -------------------------------------------------

  /**
   * The setup save of one account sent to the wallet and not yet settled. A
   * stored value that is not a save in flight reads absent, and a claim writes
   * over it.
   */
  const saveInFlight = (chainId: ChainId, account: Address): SaveInFlightAccessor => {
    const key = recordKeys.saveInFlight(chainId, account)
    const read = () => readSaveInFlight(key)
    return {
      read,
      claim: (claim: SaveInFlightClaim) =>
        inQueue(key, async () => {
          const current = await read()
          if (current.status === 'present') {
            return { claimed: false, record: { value: current.value, savedAt: current.savedAt } }
          }
          const value: SaveInFlightRecord = {
            draft: claim.draft,
            prepared: claim.prepared,
            requestId: claim.requestId,
            claimedAt: claim.claimedAt,
            ...(claim.startBlock === undefined ? {} : { startBlock: claim.startBlock })
          }
          if (!isSaveInFlight(value)) {
            throw new Error(`Invalid save in flight, not written: ${key}`)
          }
          const record = await writeKey<SaveInFlightRecord>(key, value)
          return { claimed: true, record }
        }),
      markSent: (requestId: string, transactionHash: Hex, startBlock?: number) =>
        inQueue(key, async () => {
          const current = await read()
          if (current.status !== 'present' || current.value.requestId !== requestId) {
            return current
          }
          const value: SaveInFlightRecord = {
            ...current.value,
            transactionHash,
            ...(current.value.transactionHash === undefined ? { sentAt: now() } : {}),
            ...(startBlock === undefined ? {} : { startBlock })
          }
          if (!isSaveInFlight(value)) {
            throw new Error(`Invalid save in flight, not written: ${key}`)
          }
          const record = await writeKey<SaveInFlightRecord>(key, value)
          return { status: 'present' as const, ...record }
        }),
      release: (requestId: string) =>
        inQueue(key, async () => {
          const current = await read()
          if (current.status !== 'present' || current.value.requestId !== requestId) {
            return false
          }
          await storage.remove(key)
          return true
        }),
      releaseUnsent: (requestId: string) =>
        inQueue(key, async () => {
          const current = await read()
          if (
            current.status !== 'present' ||
            current.value.requestId !== requestId ||
            current.value.transactionHash !== undefined
          ) {
            return false
          }
          await storage.remove(key)
          return true
        })
    }
  }

  return {
    setup,
    setupSavedAt,
    saveSetup,
    startOverSetup,
    recoverySession,
    listRecoverySessions,
    recoveryEntry,
    listRecoveryEntries,
    wipeRecoverySession,
    landSubmission,
    clearWipedSession,
    endCountdown,
    countdown,
    restoreCountdown,
    listCountdowns,
    decryptedSetupCache,
    saveInFlight,
    ceremonyRequest
  }
}
