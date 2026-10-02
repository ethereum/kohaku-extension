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
import { bytesToHex, isAddress, isAddressEqual } from 'viem'

import { parse, stringify } from '@ambire-common/libs/richJson/richJson'
import type { Address, Gathering, Hex } from '@web/modules/social-recovery/sdk-interfaces'

import { wipeRecoveryPassword } from './recoveryPassword'
import { ABSENT, SETUP_RECORD_NAMES } from './types'
import type {
  CeremonyRequestRecord,
  ChainId,
  CountdownAccessor,
  CountdownRead,
  CountdownRecord,
  DecryptedSetupCacheRecord,
  DirectWipeEvent,
  ExpectedRevision,
  ListedRecord,
  LiveRecoverySession,
  RecordAccessor,
  RecordRead,
  RecoverySessionAccessor,
  RecoverySessionRecord,
  SaveInFlightAccessor,
  SaveInFlightClaim,
  SaveInFlightRecord,
  SessionRead,
  SessionRevision,
  SetupDraftRecord,
  SetupRecordName,
  SetupRecords,
  StoredRecord,
  StoredSession,
  WalletRecords,
  WalletRecordsOptions
} from './types'

/** The prefix of every storage key the records use. */
export const RECORDS_KEY_PREFIX = 'socialRecovery'

const chainPart = (chainId: ChainId | string): string => {
  const text = String(chainId)
  if (!/^[0-9]+$/.test(text)) throw new Error(`Invalid chain id: ${text}`)
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
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error(`Invalid request id: ${id}`)
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

/**
 * The storage keys, `socialRecovery:<record>:<chainId>:<account>` with the
 * account in lowercase, so a write for one account never touches another:
 *
 * - `setupDraft`, `inventory`, `path`, `enrollments`, `waitingPeriod` and
 *   `passwordSet`: the six setup records;
 * - `recoverySession`: the live gathering, the reason line a wipe leaves, or in
 *   its landed state the countdown's record;
 * - `decryptedSetupCache`: the setup the recovery password unlocked;
 * - `saveInFlight`: the setup save sent to the wallet and not yet settled.
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
  decryptedSetupCache: (chainId: ChainId, account: Address): string =>
    `${RECORDS_KEY_PREFIX}:decryptedSetupCache:${chainPart(chainId)}:${accountPart(account)}`,
  saveInFlight: (chainId: ChainId, account: Address): string =>
    `${RECORDS_KEY_PREFIX}:saveInFlight:${chainPart(chainId)}:${accountPart(account)}`,
  ceremonyRequest: (id: string): string =>
    `${RECORDS_KEY_PREFIX}:ceremonyRequest:${requestIdPart(id)}`
}

const isStoredRecord = (stored: unknown): stored is StoredRecord<unknown> => {
  if (typeof stored !== 'object' || stored === null || !('value' in stored)) return false
  const { savedAt } = stored as { savedAt?: unknown }
  return typeof savedAt === 'number' && Number.isFinite(savedAt)
}

const SESSION_STATES = ['live', 'wiped', 'landed']

const isSessionRecord = (value: unknown): value is RecoverySessionRecord =>
  typeof value === 'object' &&
  value !== null &&
  SESSION_STATES.includes((value as { state?: unknown }).state as string)

const isStoredSession = (stored: unknown): stored is StoredSession => {
  if (!isStoredRecord(stored) || !isSessionRecord(stored.value)) return false
  const { revision } = stored as { revision?: unknown }
  return typeof revision === 'string' && revision !== ''
}

/**
 * Whether a stored value is a ceremony request: its account, chain and method,
 * and what its call needs, an enrollment's method address or a test's or a
 * claim's request.
 */
const isCeremonyRequest = (value: unknown): value is CeremonyRequestRecord => {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  if (
    typeof record.account !== 'string' ||
    !isAddress(record.account, { strict: false }) ||
    (typeof record.chainId !== 'number' && typeof record.chainId !== 'bigint') ||
    typeof record.method !== 'string'
  ) {
    return false
  }
  switch (record.call) {
    case 'enroll':
      return (
        typeof record.methodAddress === 'string' &&
        isAddress(record.methodAddress, { strict: false })
      )
    case 'testAccess':
    case 'createClaim':
      return typeof record.request === 'object' && record.request !== null
    case 'healthCheck':
      return true
    default:
      return false
  }
}

/**
 * Whether a stored value is a save in flight: a draft, a prepared call or
 * batch, the request id, the claim time and, where present, the hash and the
 * start block.
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
    (record.startBlock === undefined ||
      (Number.isSafeInteger(record.startBlock) && (record.startBlock as number) >= 0))
  )
}

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
      if (queues.get(key) === settled) queues.delete(key)
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
const inQueue = <R>(key: string, task: () => Promise<R>): Promise<R> => {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  if (locks) return locks.request(key, () => task()) as Promise<R>
  return inMemoryQueue(key, task)
}

/**
 * Runs one update that spans several keys while it holds the queue of each,
 * taken one after another in the order given, so no single-key update of any
 * of them interleaves with it. Every caller passes its setup keys in the order
 * of `SETUP_RECORD_NAMES` and the save in flight's key after them, and a
 * single-key update holds one key alone. An update can wait for another that
 * holds a key it needs, but never for one that waits for a key it holds, so
 * the waits never form a cycle.
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
    if (!isStoredRecord(stored)) return ABSENT
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

  const accessor = <T>(key: string): RecordAccessor<T> => ({
    read: () => readKey<T>(key),
    write: (value: T) => inQueue(key, () => writeKey<T>(key, value)),
    wipe: () => removeKey(key),
    age: async (at?: number) => recordAge(await readKey<T>(key), at ?? now())
  })

  /**
   * The save in flight stored under a key. A stored value that is not a save in
   * flight reads absent.
   */
  const readSaveInFlight = async (key: string): Promise<RecordRead<SaveInFlightRecord>> => {
    const stored: unknown = await storage.get(key, undefined)
    if (!isStoredRecord(stored) || !isSaveInFlight(stored.value)) {
      return ABSENT
    }
    return { status: 'present', value: stored.value, savedAt: stored.savedAt }
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
      setupDraft: accessor(draftKey),
      inventory: accessor(recordKeys.setup('inventory', chainId, account)),
      path: accessor(pathKey),
      enrollments: accessor(recordKeys.setup('enrollments', chainId, account)),
      waitingPeriod: accessor(recordKeys.setup('waitingPeriod', chainId, account)),
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
    if (!isStoredSession(stored)) return ABSENT
    return {
      status: 'present',
      value: stored.value,
      savedAt: stored.savedAt,
      revision: stored.revision
    }
  }

  const writeSessionAt = async (
    key: string,
    value: RecoverySessionRecord
  ): Promise<StoredSession> => {
    const record: StoredSession = { value, savedAt: now(), revision: newRevision() }
    await storage.set(key, record)
    return record
  }

  const readSession = (chainId: ChainId, account: Address) =>
    readSessionAt(recordKeys.recoverySession(chainId, account))

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
    if (revisionOf(current) !== expectedRevision) throw new SessionRevisionConflict(key)
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
          if (current.status === 'present' && current.value.state === 'landed') {
            throw new Error(
              'A landed session holds the countdown: end it once its attempt ends, then gather again'
            )
          }
          if (current.status === 'present' && current.value.state === 'live') {
            const stored = current.value.gathering
            // A new request would replace the gathering: that takes a wipe first.
            if (!sameStoredValue(stored.request, request)) {
              throw new Error(
                'A live session holds another request: wipe it with one of the five events first'
              )
            }
            // A later reply for the same place may displace a stored reply; no reply is dropped.
            const places = new Set(gathering.replies.map((reply) => reply.place))
            const dropped = stored.replies.filter((reply) => !places.has(reply.place))
            if (dropped.length) {
              throw new Error(
                `The write drops the reply at place ${dropped
                  .map((reply) => reply.place)
                  .join(', ')}`
              )
            }
          }
          return writeSessionAt(key, { state: 'live', gathering })
        })
      },
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
              record: { value: stored.value, savedAt: stored.savedAt, revision: stored.revision }
            }
          ]
        : []
    )
  }

  /** Every recovery session stored on a chain, live, wiped or landed, for the home surface. */
  const listRecoverySessions = (chainId: ChainId) => scanSessions(chainId)

  /**
   * One of four events wipes a live recovery session: the deadline passed,
   * another attempt opened, the setup changed or the recoverer abandoned. The
   * gathering, with its replies and its attempt id, is deleted, and the session
   * keeps the reason, the account and, for `deadline-passed`, the deadline.
   * Returns whether it wiped anything: an absent, wiped or landed session is
   * left unchanged. `submission-landed` runs through `landSubmission`, and a
   * security stop or a pause is no wipe event. Throws `SessionRevisionConflict`
   * when the session changed after the caller read `expectedRevision`.
   */
  const wipeRecoverySession = (
    chainId: ChainId,
    account: Address,
    event: DirectWipeEvent,
    expectedRevision: ExpectedRevision
  ): Promise<boolean> =>
    updateSession(chainId, account, expectedRevision, async (current, key) => {
      if (current.status !== 'present' || current.value.state !== 'live') return false
      const { request } = current.value.gathering
      await writeSessionAt(key, {
        state: 'wiped',
        reason: event,
        account: request.account,
        ...(event === 'deadline-passed' ? { deadline: request.validUntil } : {})
      })
      return true
    })

  /**
   * The submission landed: the live session survives as the countdown's record,
   * `{ state: 'landed', account }`, written in one set in place of the live
   * session, so the gathering, its replies and its attempt id are gone in the
   * same write. Refuses when no live session exists, and throws
   * `SessionRevisionConflict` when the session changed after the caller read
   * `expectedRevision`.
   */
  const landSubmission = async (
    chainId: ChainId,
    account: Address,
    expectedRevision: ExpectedRevision
  ) =>
    updateSession(chainId, account, expectedRevision, async (current, key) => {
      if (current.status !== 'present' || current.value.state !== 'live') {
        throw new Error(`No live recovery session for ${account} on chain ${chainPart(chainId)}`)
      }
      const landedAccount = current.value.gathering.request.account
      const written = await writeSessionAt(key, { state: 'landed', account: landedAccount })
      return {
        value: { account: landedAccount },
        savedAt: written.savedAt,
        revision: written.revision
      }
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
      if (current.status !== 'present' || current.value.state !== state) return false
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
          value: { account: read.value.account },
          savedAt: read.savedAt,
          revision: read.revision
        }
      : ABSENT

  /** The countdown's record of one account: the session in its landed state, the account alone. */
  const countdown = (chainId: ChainId, account: Address): CountdownAccessor => ({
    read: async () => asCountdown(await readSession(chainId, account)),
    age: async (at?: number) =>
      recordAge(asCountdown(await readSession(chainId, account)), at ?? now())
  })

  /** Every countdown on a chain, the landed sessions, for the home surface. */
  const listCountdowns = async (chainId: ChainId): Promise<ListedRecord<CountdownRecord>[]> =>
    (await scanSessions(chainId)).flatMap(({ record }) =>
      record.value.state === 'landed'
        ? [
            {
              account: record.value.account,
              record: {
                value: { account: record.value.account },
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
   * setup nonce it was read under. It stays after the recovery executes; no
   * wipe of these records touches it.
   */
  const decryptedSetupCache = (
    chainId: ChainId,
    account: Address
  ): RecordAccessor<DecryptedSetupCacheRecord> =>
    accessor<DecryptedSetupCacheRecord>(recordKeys.decryptedSetupCache(chainId, account))

  // --- the ceremony request ------------------------------------------------

  /**
   * The ceremony request under one request id. A stored value that is not a
   * ceremony request reads absent, so the tab finds nothing to run under it.
   */
  const ceremonyRequest = (id: string): RecordAccessor<CeremonyRequestRecord> => {
    const key = recordKeys.ceremonyRequest(id)
    const read = async (): Promise<RecordRead<CeremonyRequestRecord>> => {
      const stored: unknown = await storage.get(key, undefined)
      if (!isStoredRecord(stored) || !isCeremonyRequest(stored.value)) return ABSENT
      return { status: 'present', value: stored.value, savedAt: stored.savedAt }
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
    wipeRecoverySession,
    landSubmission,
    clearWipedSession,
    endCountdown,
    countdown,
    listCountdowns,
    decryptedSetupCache,
    saveInFlight,
    ceremonyRequest
  }
}
