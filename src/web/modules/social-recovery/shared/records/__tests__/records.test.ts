/**
 * The wallet's records: the six setup records, the recovery session and its
 * five wipe events, the countdown the landed session carries, the decrypted
 * setup cache, and the ceremony request the ceremony tab reads.
 *
 * Every test runs against an in-memory double of
 * src/web/extension-services/background/webapi/storage.ts that behaves like it:
 * `set` stores the rich JSON string of a non-string value, and `get` returns the
 * default when the stored string is falsy and parses it otherwise. So a field
 * holding `undefined` loses its key and a `bigint` survives, as in the extension.
 */
import { parse, stringify } from '@ambire-common/libs/richJson/richJson'
import en from '@common/config/localization/translations/en.json'
import type {
  Address,
  ApproverReply,
  ApproverRequest,
  Configuration,
  Gathering,
  Hex,
  SetupDraft
} from '@web/modules/social-recovery/sdk-interfaces'
import { parseCeremonySearch } from '@web/modules/social-recovery/shared/ceremony'
import {
  ABSENT,
  CeremonyRequestRecord,
  ChainId,
  createWalletRecords,
  DecryptedSetupCacheRecord,
  defaultSetupDraft,
  DirectWipeEvent,
  emptySlot,
  Enrollment,
  ExpectedRevision,
  extensionRecordStorage,
  isEmptySlot,
  isSessionRevisionConflict,
  newCeremonyRequestId,
  predictedAttemptId,
  recordAge,
  recordKeys,
  RecordRead,
  RecordStorage,
  RecoverySessionRecord,
  RecoveryWipeEvent,
  revisionOf,
  SessionRead,
  SessionRevisionConflict,
  SETUP_RECORD_NAMES,
  SetupRecordName,
  SetupRecordValues,
  SLOT_KINDS,
  slotKindOf,
  WIPE_REASON_STRING_KEYS
} from '@web/modules/social-recovery/shared/records'

// The extension's `browser.storage.local` for `extensionRecordStorage`: one
// in-memory store, holding what the helper writes.
jest.mock('@web/constants/browserapi', () => {
  const entries = new Map<string, unknown>()
  return {
    isExtension: true,
    browser: {
      storage: {
        local: {
          get: async () => Object.fromEntries(entries),
          set: async (items: Record<string, unknown>) => {
            Object.entries(items).forEach(([key, value]) => entries.set(key, value))
          },
          remove: async (keys: string[]) => {
            keys.forEach((key) => entries.delete(key))
          }
        }
      }
    }
  }
})

type StorageDouble = {
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

// The helper's `formatValue`: parse a string, or return it as is when it is not JSON.
const formatValue = (stored: string): unknown => {
  try {
    return parse(stored)
  } catch (error) {
    return stored
  }
}

const makeStorage = (): StorageDouble => {
  const raw = new Map<string, string>()
  const calls = {
    set: [] as string[],
    remove: [] as string[],
    setEntries: [] as string[][],
    removeKeys: [] as string[][]
  }
  const faults: StorageDouble['faults'] = {}
  // The helper's serialization: a string as is, anything else through richJson.
  // `browser.storage.local.set({ [key]: undefined })` stores nothing.
  const serialize = (value: unknown): string | undefined =>
    typeof value === 'string' ? value : stringify(value)
  const set = async (key: string, value: unknown): Promise<null> => {
    calls.set.push(key)
    const serialized = serialize(value)
    if (serialized !== undefined) raw.set(key, serialized)
    return null
  }
  const remove = async (key: string): Promise<null> => {
    calls.remove.push(key)
    raw.delete(key)
    return null
  }
  // One `browser.storage.local` call over several keys lands whole or not at
  // all: every value is serialized first, and an injected fault stores nothing.
  const takeFault = (name: keyof StorageDouble['faults']) => {
    const fault = faults[name]
    delete faults[name]
    if (fault) throw fault
  }
  return {
    raw,
    calls,
    faults,
    // The helper's rule: `if (!res[key]) return defaultValue`, then `formatValue`.
    get: async (key, defaultValue) => {
      const stored = key && raw.get(key)
      if (!stored) return defaultValue
      return formatValue(stored)
    },
    getAll: async () =>
      Object.fromEntries([...raw.entries()].map(([key, stored]) => [key, formatValue(stored)])),
    set,
    remove,
    setEntries: async (entries) => {
      calls.setEntries.push(Object.keys(entries))
      takeFault('setEntries')
      const serialized = Object.entries(entries).map(([key, value]) => [key, serialize(value)])
      serialized.forEach(([key, value]) => {
        if (value !== undefined) raw.set(key as string, value)
      })
    },
    removeKeys: async (keys) => {
      calls.removeKeys.push([...keys])
      takeFault('removeKeys')
      keys.forEach((key) => raw.delete(key))
    }
  }
}

// A record the platform keeps for the holder's credentials, which neither save
// nor start over may touch.
const PLATFORM_CREDENTIALS_KEY = 'keystoreKeys'
const PLATFORM_CREDENTIALS = [{ addr: '0xCredential', type: 'internal', label: 'passkey' }]

const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'
const OTHER_ACCOUNT: Address = '0x2222222222222222222222222222222222222222'
const METHOD: Address = '0x3333333333333333333333333333333333333333'
const MANAGER: Address = '0x4444444444444444444444444444444444444444'
const ACTION: Address = '0x5555555555555555555555555555555555555555'
// One address in three spellings: lower case, its checksum, and a mixed case
// that fails the checksum.
const LOWER: Address = '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed'
const CHECKSUMMED: Address = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
const MISCASED: Address = '0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
const CHAIN_ID = 11155111n
const T0 = 1_700_000_000_000
const HOUR = 60 * 60 * 1000

const SETUP_DRAFT: SetupDraft = {
  wait: 86400n,
  clauses: [{ threshold: 1, credentials: [{ method: METHOD, config: '0xabcd' }] }],
  ignoresPause: false,
  privacy: { publicMetadata: '0x', backup: 'encrypted' }
}

const ENROLLMENT: Enrollment = {
  credential: { method: METHOD, config: '0xabcd' },
  test: 'passed',
  backup: 'device-bound'
}

const SETUP_SAMPLES: SetupRecordValues = {
  setupDraft: SETUP_DRAFT,
  inventory: ['another-device', 'guardian-wallets'],
  path: SETUP_DRAFT.clauses,
  enrollments: [ENROLLMENT],
  waitingPeriod: 86400n,
  passwordSet: 'password-set'
}

const CONFIGURATION: Configuration = {
  clauses: SETUP_DRAFT.clauses,
  wait: SETUP_DRAFT.wait,
  ignoresPause: false
}
const CACHE: DecryptedSetupCacheRecord = { configuration: CONFIGURATION, setupNonce: 3n }

const PREDICTED_ATTEMPT_ID = 7n
const VALID_UNTIL = '1700086400'
const PROOF_A = '0xdeadbeefdeadbeef'
const PROOF_B = '0xfeedfacefeedface'

const reply = (place: number, proof: Hex, account: Address = ACCOUNT): ApproverReply => ({
  kind: 'recovery-proof-reply',
  version: 1,
  chainId: CHAIN_ID.toString(),
  manager: MANAGER,
  account,
  action: ACTION,
  attemptId: PREDICTED_ATTEMPT_ID.toString(),
  purpose: 'approval',
  place,
  method: METHOD,
  config: '0xabcd',
  salt: '0x01',
  digest: '0x0badc0de',
  proof
})

const APPROVALS: ApproverReply[] = [reply(0, PROOF_A), reply(1, PROOF_B)]

// The SDK's gathering record, the body of a live session.
const gathering = (
  account: Address = ACCOUNT,
  replies: ApproverReply[] = APPROVALS,
  request: Partial<Gathering['request']> = {}
): Gathering => ({
  kind: 'gathering',
  version: 1,
  purpose: 'approval',
  request: {
    chainId: CHAIN_ID.toString(),
    manager: MANAGER,
    digestVersion: '1',
    account,
    action: ACTION,
    attemptId: PREDICTED_ATTEMPT_ID.toString(),
    setupNonce: '3',
    setupBody: '0x00',
    validUntil: VALID_UNTIL,
    block: { number: 1, timestamp: '1700000000', hash: '0x01' },
    ...request
  },
  places: [0, 1].map((place) => ({
    place,
    method: METHOD,
    config: '0xabcd',
    salt: '0x01',
    standing: 'not-stopped',
    stoppable: false
  })),
  replies
})

const GATHERING = gathering()

const FIVE_EVENTS: RecoveryWipeEvent[] = [
  'submission-landed',
  'deadline-passed',
  'another-attempt-opened',
  'setup-changed',
  'recoverer-abandoned'
]
const DIRECT_EVENTS = FIVE_EVENTS.filter((e) => e !== 'submission-landed') as DirectWipeEvent[]

const setup = (clock: { t: number } = { t: T0 }) => {
  const storage = makeStorage()
  const records = createWalletRecords({ storage, now: () => clock.t })
  return { storage, records, clock }
}

type Records = ReturnType<typeof createWalletRecords>

const present = <T>(read: RecordRead<T>) => {
  if (read.status !== 'present') throw new Error('expected a present record')
  return read
}

// Each session update below passes the revision of a fresh read, as a caller
// does, so a refusal comes from the rule under test and never from the revision.
const revisionNow = async (records: Records, account: Address, chainId: ChainId) =>
  revisionOf(await records.recoverySession(chainId, account).read())

const writeSession = async (
  records: Records,
  value: Gathering,
  account: Address = ACCOUNT,
  chainId: ChainId = CHAIN_ID
) =>
  records
    .recoverySession(chainId, account)
    .write(value, await revisionNow(records, account, chainId))

const wipeSession = async (records: Records, event: DirectWipeEvent, account: Address = ACCOUNT) =>
  records.wipeRecoverySession(
    CHAIN_ID,
    account,
    event,
    await revisionNow(records, account, CHAIN_ID)
  )

const landSession = async (
  records: Records,
  account: Address = ACCOUNT,
  chainId: ChainId = CHAIN_ID
) => records.landSubmission(chainId, account, await revisionNow(records, account, chainId))

const clearWiped = async (records: Records, account: Address = ACCOUNT) =>
  records.clearWipedSession(CHAIN_ID, account, await revisionNow(records, account, CHAIN_ID))

const endSessionCountdown = async (records: Records, account: Address = ACCOUNT) =>
  records.endCountdown(CHAIN_ID, account, await revisionNow(records, account, CHAIN_ID))

// Every stored string, keys included, to prove a secret is gone.
const dump = (storage: StorageDouble) => [...storage.raw.entries()].flat().join('\n')

// Every stored value, parsed back as the helper would.
const storedValues = (storage: StorageDouble) => [...storage.raw.values()].map((s) => parse(s))

// A call that may throw synchronously or reject, as a promise.
const attempt = (fn: () => unknown) => Promise.resolve().then(fn)

const writeAllSetup = async (records: Records, account: Address = ACCOUNT) => {
  const six = records.setup(CHAIN_ID, account)
  await six.setupDraft.write(SETUP_SAMPLES.setupDraft)
  await six.inventory.write(SETUP_SAMPLES.inventory)
  await six.path.write(SETUP_SAMPLES.path)
  await six.enrollments.write(SETUP_SAMPLES.enrollments)
  await six.waitingPeriod.write(SETUP_SAMPLES.waitingPeriod)
  await six.passwordSet.write(SETUP_SAMPLES.passwordSet)
}

// The one line a wipe keeps for an event: the reason, the account and, for an
// expired request, its deadline. The submission landing keeps the landed state,
// the countdown's record, which holds the account address alone.
const wipedLine = (event: RecoveryWipeEvent): RecoverySessionRecord =>
  event === 'submission-landed'
    ? { state: 'landed', account: ACCOUNT }
    : {
        state: 'wiped',
        reason: event,
        account: ACCOUNT,
        ...(event === 'deadline-passed' ? { deadline: VALID_UNTIL } : {})
      }

const wipeFor = async (records: Records, event: RecoveryWipeEvent) => {
  if (event === 'submission-landed') await landSession(records)
  else await wipeSession(records, event)
}

describe('the six setup records', () => {
  SETUP_RECORD_NAMES.forEach((name: SetupRecordName) =>
    describe(name, () => {
      const accessorOf = (records: Records) =>
        records.setup(CHAIN_ID, ACCOUNT)[name] as unknown as {
          read(): Promise<RecordRead<unknown>>
          write(value: unknown): Promise<unknown>
          age(at?: number): Promise<number | null>
        }

      it('round-trips its value with its savedAt', async () => {
        const { records } = setup()
        await accessorOf(records).write(SETUP_SAMPLES[name])
        const read = present(await accessorOf(records).read())
        expect(read.savedAt).toBe(T0)
        expect(read.value).toEqual(SETUP_SAMPLES[name])
      })

      it('reports its age for a fixed now', async () => {
        const { records, clock } = setup()
        await accessorOf(records).write(SETUP_SAMPLES[name])
        expect(await accessorOf(records).age(T0 + 3 * HOUR)).toBe(3 * HOUR)
        clock.t = T0 + 5 * HOUR
        expect(await accessorOf(records).age()).toBe(5 * HOUR)
        expect(recordAge(await accessorOf(records).read(), T0 + HOUR)).toBe(HOUR)
      })

      it('reads as absent before any write, never as false or zero', async () => {
        const { records } = setup()
        const read = await accessorOf(records).read()
        expect(read).toBe(ABSENT)
        expect(read).not.toBe(false)
        expect(read).not.toBe(0)
        expect(await accessorOf(records).age(T0)).toBeNull()
      })
    })
  )

  it('reports the draft age as the latest savedAt of the six', async () => {
    const { records, clock } = setup()
    expect(await records.setupSavedAt(CHAIN_ID, ACCOUNT)).toBeNull()
    await records.setup(CHAIN_ID, ACCOUNT).setupDraft.write(SETUP_DRAFT)
    clock.t = T0 + HOUR
    await records.setup(CHAIN_ID, ACCOUNT).passwordSet.write('password-set')
    expect(await records.setupSavedAt(CHAIN_ID, ACCOUNT)).toBe(T0 + HOUR)
  })
  ;(
    [
      ['save', 'saveSetup'],
      ['start over', 'startOverSetup']
    ] as const
  ).forEach(([label, act]) =>
    it(`${label} wipes all six while platform credentials survive`, async () => {
      const { storage, records } = setup()
      await storage.set(PLATFORM_CREDENTIALS_KEY, PLATFORM_CREDENTIALS)
      await writeAllSetup(records)
      await records[act](CHAIN_ID, ACCOUNT)
      const six = records.setup(CHAIN_ID, ACCOUNT)
      const reads = await Promise.all(SETUP_RECORD_NAMES.map((name) => six[name].read()))
      reads.forEach((read) => expect(read).toBe(ABSENT))
      expect(await storage.get(PLATFORM_CREDENTIALS_KEY)).toEqual(PLATFORM_CREDENTIALS)
      expect([...storage.raw.keys()]).toEqual([PLATFORM_CREDENTIALS_KEY])
    })
  )

  it('keys the setup records by chain and account: a save on one leaves the other untouched', async () => {
    const { records } = setup()
    await writeAllSetup(records, ACCOUNT)
    await writeAllSetup(records, OTHER_ACCOUNT)
    await records.setup(1n, ACCOUNT).setupDraft.write(SETUP_DRAFT)
    await records.saveSetup(CHAIN_ID, ACCOUNT)
    expect(present(await records.setup(CHAIN_ID, OTHER_ACCOUNT).setupDraft.read()).value).toEqual(
      SETUP_DRAFT
    )
    expect(present(await records.setup(1n, ACCOUNT).setupDraft.read()).value).toEqual(SETUP_DRAFT)
  })

  it('keys the account case-insensitively, so a checksummed address reads the same record', async () => {
    const { records } = setup()
    const checksummed = '0xAbCdEf0000000000000000000000000000000001' as Address
    await records.setup(CHAIN_ID, checksummed).inventory.write(['passport'])
    const lower = checksummed.toLowerCase() as Address
    expect(present(await records.setup(CHAIN_ID, lower).inventory.read()).value).toEqual([
      'passport'
    ])
  })

  it('keys an address alike in lower case, in its checksum and in a mixed case that fails the checksum', async () => {
    const { storage, records } = setup()
    await records.setup(CHAIN_ID, MISCASED).inventory.write(['passport'])
    const reads = await Promise.all(
      [LOWER, CHECKSUMMED, MISCASED].map((spelling) =>
        records.setup(CHAIN_ID, spelling).inventory.read()
      )
    )
    reads.forEach((read) => expect(present(read).value).toEqual(['passport']))
    expect([...storage.raw.keys()]).toEqual([`socialRecovery:inventory:${CHAIN_ID}:${LOWER}`])
  })

  it('an enrollment keeps its passkey backup kind', async () => {
    const { records } = setup()
    const synced: Enrollment = { ...ENROLLMENT, backup: 'synced' }
    await records.setup(CHAIN_ID, ACCOUNT).enrollments.write([ENROLLMENT, synced])
    const { value } = present(await records.setup(CHAIN_ID, ACCOUNT).enrollments.read())
    expect(value.map((e) => e.backup)).toEqual(['device-bound', 'synced'])
  })
})

describe('the empty slots of a path', () => {
  it('a slot of each kind round-trips through storage and still reads as an empty slot of its kind', async () => {
    const { records } = setup()
    const path = [{ threshold: 2, credentials: SLOT_KINDS.map(emptySlot) }]
    await records.setup(CHAIN_ID, ACCOUNT).path.write(path)
    const { value } = present(await records.setup(CHAIN_ID, ACCOUNT).path.read())
    expect(value).toEqual(path)
    expect(value[0].credentials.map(isEmptySlot)).toEqual(SLOT_KINDS.map(() => true))
    expect(value[0].credentials.map(slotKindOf)).toEqual([...SLOT_KINDS])
  })

  it('an enrolled method is no slot and has no slot kind, whatever its label says', () => {
    const enrolled = { method: METHOD, config: '0xabcd' as Hex, label: 'passkey' }
    expect(isEmptySlot(enrolled)).toBe(false)
    expect(slotKindOf(enrolled)).toBeUndefined()
  })

  it('a slot whose label names no known kind, or that has no label, has no slot kind', () => {
    const unknown = { ...emptySlot('passkey'), label: 'carrier-pigeon' }
    const unlabelled = { method: emptySlot('passkey').method, config: '0x' as Hex }
    expect(isEmptySlot(unknown)).toBe(true)
    expect(slotKindOf(unknown)).toBeUndefined()
    expect(isEmptySlot(unlabelled)).toBe(true)
    expect(slotKindOf(unlabelled)).toBeUndefined()
  })

  it('a zero-address credential with a config is an ordinary credential, whatever its label says', () => {
    const configured = { ...emptySlot('passkey'), config: '0xabcd' as Hex }
    expect(isEmptySlot(configured)).toBe(false)
    expect(slotKindOf(configured)).toBeUndefined()
  })

  it('a slot filled with the enrolled method it waited for is no longer a slot', () => {
    const slot = emptySlot('passkey')
    const filled = { ...slot, method: METHOD, config: '0xabcd' as Hex }
    expect(isEmptySlot(slot)).toBe(true)
    expect(isEmptySlot(filled)).toBe(false)
    expect(slotKindOf(filled)).toBeUndefined()
  })
})

describe('the default setup draft', () => {
  it('waits 48 hours, holds no clause, opts out of the pause and keeps an encrypted private backup', () => {
    const draft = defaultSetupDraft()
    expect(draft.wait).toBe(BigInt(48 * 60 * 60))
    expect(draft.clauses).toEqual([])
    expect(draft.ignoresPause).toBe(true)
    expect(draft.privacy).toEqual({ publicMetadata: '0x', backup: 'encrypted' })
  })

  it('round-trips through storage with its wait still a bigint', async () => {
    const { records } = setup()
    await records.setup(CHAIN_ID, ACCOUNT).setupDraft.write(defaultSetupDraft())
    const { value } = present(await records.setup(CHAIN_ID, ACCOUNT).setupDraft.read())
    expect(value).toEqual(defaultSetupDraft())
    expect(typeof value.wait).toBe('bigint')
  })

  it('each call returns a fresh draft with a fresh clause list', () => {
    const first = defaultSetupDraft()
    const second = defaultSetupDraft()
    expect(second).toEqual(first)
    expect(second).not.toBe(first)
    expect(second.clauses).not.toBe(first.clauses)
    expect(second.privacy).not.toBe(first.privacy)
  })

  it('a caller that changes the draft it got, clauses and privacy included, leaves the next call as it was', async () => {
    const draft = defaultSetupDraft()
    draft.clauses.push({ threshold: 1, credentials: [emptySlot('passkey')] })
    draft.privacy.backup = 'clear'
    draft.wait = 86400n
    draft.ignoresPause = false
    const { records } = setup()
    await records.setup(CHAIN_ID, ACCOUNT).writeDraftAndPath(draft)
    const next = defaultSetupDraft()
    expect(next.clauses).toEqual([])
    expect(next.privacy.backup).toBe('encrypted')
    expect(next.wait).toBe(BigInt(48 * 60 * 60))
    expect(next.ignoresPause).toBe(true)
  })
})

describe('the setup draft and its path are written together', () => {
  const DRAFT: SetupDraft = {
    ...defaultSetupDraft(),
    clauses: [
      { threshold: 1, credentials: [emptySlot('passkey')] },
      { threshold: 2, credentials: [emptySlot('ecdsa'), emptySlot('ecdsa'), emptySlot('ecdsa')] }
    ]
  }
  const draftKey = recordKeys.setup('setupDraft', CHAIN_ID, ACCOUNT)
  const pathKey = recordKeys.setup('path', CHAIN_ID, ACCOUNT)

  it('stores the draft and its clauses as the path in one storage call, with one savedAt', async () => {
    const { storage, records, clock } = setup()
    clock.t = T0 + HOUR
    const written = await records.setup(CHAIN_ID, ACCOUNT).writeDraftAndPath(DRAFT)
    expect(storage.calls.setEntries).toEqual([[draftKey, pathKey]])
    expect(storage.calls.set).toEqual([])
    expect(written.setupDraft.savedAt).toBe(T0 + HOUR)
    expect(written.path.savedAt).toBe(T0 + HOUR)

    const six = records.setup(CHAIN_ID, ACCOUNT)
    const draft = present(await six.setupDraft.read())
    const path = present(await six.path.read())
    expect(draft.value).toEqual(DRAFT)
    expect(path.value).toEqual(DRAFT.clauses)
    expect(draft.savedAt).toBe(T0 + HOUR)
    expect(path.savedAt).toBe(T0 + HOUR)
    expect(await records.setupSavedAt(CHAIN_ID, ACCOUNT)).toBe(T0 + HOUR)
  })

  it('replaces an earlier draft and path together', async () => {
    const { records, clock } = setup()
    await writeAllSetup(records)
    clock.t = T0 + 2 * HOUR
    await records.setup(CHAIN_ID, ACCOUNT).writeDraftAndPath(DRAFT)
    const six = records.setup(CHAIN_ID, ACCOUNT)
    expect(present(await six.setupDraft.read()).value).toEqual(DRAFT)
    expect(present(await six.path.read()).value).toEqual(DRAFT.clauses)
    expect(present(await six.inventory.read()).value).toEqual(SETUP_SAMPLES.inventory)
  })

  it('a storage call that fails writes neither the draft nor the path', async () => {
    const { storage, records } = setup()
    storage.faults.setEntries = new Error('quota exceeded')
    await expect(records.setup(CHAIN_ID, ACCOUNT).writeDraftAndPath(DRAFT)).rejects.toThrow(
      'quota exceeded'
    )
    const six = records.setup(CHAIN_ID, ACCOUNT)
    expect(await six.setupDraft.read()).toBe(ABSENT)
    expect(await six.path.read()).toBe(ABSENT)
    expect(storage.raw.size).toBe(0)
  })

  it('a storage call that fails leaves the earlier draft and path as they were', async () => {
    const { storage, records, clock } = setup()
    await writeAllSetup(records)
    clock.t = T0 + HOUR
    storage.faults.setEntries = new Error('quota exceeded')
    await expect(records.setup(CHAIN_ID, ACCOUNT).writeDraftAndPath(DRAFT)).rejects.toThrow(
      'quota exceeded'
    )
    const six = records.setup(CHAIN_ID, ACCOUNT)
    expect(present(await six.setupDraft.read())).toMatchObject({
      value: SETUP_SAMPLES.setupDraft,
      savedAt: T0
    })
    expect(present(await six.path.read())).toMatchObject({ value: SETUP_SAMPLES.path, savedAt: T0 })
  })

  it('through the extension storage, the pair lands in one browser storage call and reads back', async () => {
    const { browser } = jest.requireMock('@web/constants/browserapi')
    const records = createWalletRecords({ storage: extensionRecordStorage, now: () => T0 })
    const setSpy = jest.spyOn(browser.storage.local, 'set')
    try {
      await records.setup(CHAIN_ID, ACCOUNT).writeDraftAndPath(DRAFT)
      expect(setSpy).toHaveBeenCalledTimes(1)
      expect(Object.keys(setSpy.mock.calls[0][0] as object)).toEqual([draftKey, pathKey])
      const six = records.setup(CHAIN_ID, ACCOUNT)
      expect(present(await six.setupDraft.read()).value).toEqual(DRAFT)
      expect(present(await six.path.read()).value).toEqual(DRAFT.clauses)
    } finally {
      setSpy.mockRestore()
      await extensionRecordStorage.removeKeys([draftKey, pathKey])
    }
  })
})

describe('a setup wipe removes the six records in one storage call', () => {
  const sixKeys = (account: Address = ACCOUNT) =>
    SETUP_RECORD_NAMES.map((name) => recordKeys.setup(name, CHAIN_ID, account))
  ;(
    [
      ['save', 'saveSetup'],
      ['start over', 'startOverSetup']
    ] as const
  ).forEach(([label, act]) => {
    it(`${label} removes all six keys in one call`, async () => {
      const { storage, records } = setup()
      await writeAllSetup(records)
      await records[act](CHAIN_ID, ACCOUNT)
      expect(storage.calls.removeKeys).toHaveLength(1)
      expect([...storage.calls.removeKeys[0]].sort()).toEqual([...sixKeys()].sort())
      expect(storage.calls.remove).toEqual([])
    })

    it(`${label} that fails in storage leaves every setup record in place`, async () => {
      const { storage, records } = setup()
      await writeAllSetup(records)
      storage.faults.removeKeys = new Error('storage unavailable')
      await expect(records[act](CHAIN_ID, ACCOUNT)).rejects.toThrow('storage unavailable')
      const six = records.setup(CHAIN_ID, ACCOUNT)
      const reads = await Promise.all(SETUP_RECORD_NAMES.map((name) => six[name].read()))
      reads.forEach((read, i) =>
        expect(present(read as RecordRead<unknown>).value).toEqual(
          SETUP_SAMPLES[SETUP_RECORD_NAMES[i]]
        )
      )
    })
  })

  it('through the extension storage, start over removes the six in one browser storage call', async () => {
    const { browser } = jest.requireMock('@web/constants/browserapi')
    const records = createWalletRecords({ storage: extensionRecordStorage, now: () => T0 })
    await writeAllSetup(records)
    const removeSpy = jest.spyOn(browser.storage.local, 'remove')
    try {
      await records.startOverSetup(CHAIN_ID, ACCOUNT)
      expect(removeSpy).toHaveBeenCalledTimes(1)
      expect([...(removeSpy.mock.calls[0][0] as string[])].sort()).toEqual([...sixKeys()].sort())
      const six = records.setup(CHAIN_ID, ACCOUNT)
      const reads = await Promise.all(SETUP_RECORD_NAMES.map((name) => six[name].read()))
      reads.forEach((read) => expect(read).toBe(ABSENT))
    } finally {
      removeSpy.mockRestore()
    }
  })

  it('a wipe waits for a draft write already running on the same account, so none of it survives', async () => {
    const { records } = setup()
    const six = records.setup(CHAIN_ID, ACCOUNT)
    const writing = six.writeDraftAndPath(SETUP_DRAFT)
    const wiping = records.startOverSetup(CHAIN_ID, ACCOUNT)
    await Promise.all([writing, wiping])
    expect(await six.setupDraft.read()).toBe(ABSENT)
    expect(await six.path.read()).toBe(ABSENT)
  })
})

describe('an invalid address or chain id is refused, never stored under a bad key', () => {
  const BAD_ADDRESSES = ['', '0x', 'not-an-address', '0x123', `${ACCOUNT}00`, ACCOUNT.slice(2)]
  const BAD_CHAINS: unknown[] = [-1, -1n, 1.5, NaN, 'abc', '0x1']

  BAD_ADDRESSES.forEach((bad) =>
    it(`refuses the address '${bad}' and writes nothing`, async () => {
      const { storage, records } = setup()
      const addr = bad as Address
      const refused = (fn: () => unknown) =>
        expect(attempt(fn)).rejects.toThrow(/Invalid account address/)
      await refused(() => records.setup(CHAIN_ID, addr).setupDraft.write(SETUP_DRAFT))
      await refused(() => records.setupSavedAt(CHAIN_ID, addr))
      await refused(() => records.decryptedSetupCache(CHAIN_ID, addr).read())
      await refused(() => records.decryptedSetupCache(CHAIN_ID, addr).write(CACHE))
      await refused(() => records.saveSetup(CHAIN_ID, addr))
      await refused(() => records.recoverySession(CHAIN_ID, addr).write(GATHERING, null))
      await refused(() => records.wipeRecoverySession(CHAIN_ID, addr, 'deadline-passed', null))
      await refused(() => records.countdown(CHAIN_ID, addr).read())
      await refused(() => records.landSubmission(CHAIN_ID, addr, null))
      await refused(() => records.clearWipedSession(CHAIN_ID, addr, null))
      await refused(() => records.endCountdown(CHAIN_ID, addr, null))
      expect(storage.raw.size).toBe(0)
    })
  )

  BAD_CHAINS.forEach((bad) =>
    it(`refuses the chain id ${String(bad)} and writes nothing`, async () => {
      const { storage, records } = setup()
      const chain = bad as bigint
      const refused = (fn: () => unknown) => expect(attempt(fn)).rejects.toThrow(/Invalid chain id/)
      await refused(() => records.setup(chain, ACCOUNT).setupDraft.write(SETUP_DRAFT))
      await refused(() => records.recoverySession(chain, ACCOUNT).write(GATHERING, null))
      await refused(() => records.wipeRecoverySession(chain, ACCOUNT, 'deadline-passed', null))
      await refused(() => records.listRecoverySessions(chain))
      await refused(() => records.listCountdowns(chain))
      await refused(() => records.countdown(chain, ACCOUNT).read())
      await refused(() => records.clearWipedSession(chain, ACCOUNT, null))
      await refused(() => records.endCountdown(chain, ACCOUNT, null))
      expect(storage.raw.size).toBe(0)
    })
  )
})

describe('no record is a bare boolean or zero', () => {
  it('the password-set flag stores an object, not a boolean', async () => {
    const { storage, records } = setup()
    await records.setup(CHAIN_ID, ACCOUNT).passwordSet.write('password-set')
    expect(storage.raw.size).toBe(1)
    const [serialized] = [...storage.raw.values()]
    expect(['true', 'false', '0', '1', '']).not.toContain(serialized)
    const [stored] = storedValues(storage)
    expect(typeof stored).toBe('object')
    expect(stored).not.toBeNull()
    expect(stored).toEqual({ value: 'password-set', savedAt: T0 })
  })

  it('a waiting period of zero still reads as a stored fact, not as absent', async () => {
    const { records } = setup()
    await records.setup(CHAIN_ID, ACCOUNT).waitingPeriod.write(0n)
    expect(present(await records.setup(CHAIN_ID, ACCOUNT).waitingPeriod.read()).value).toBe(0n)
  })

  it('a bigint survives the rich JSON the helper stores', async () => {
    const { storage, records } = setup()
    await records.setup(CHAIN_ID, ACCOUNT).setupDraft.write(SETUP_DRAFT)
    expect(dump(storage)).toContain('$bigint')
    const { value } = present(await records.setup(CHAIN_ID, ACCOUNT).setupDraft.read())
    expect(typeof value.wait).toBe('bigint')
    expect(value.wait).toBe(86400n)
  })

  it('a record whose value is undefined loses its value key and reads as absent, never as present', async () => {
    const { storage, records } = setup()
    await records
      .setup(CHAIN_ID, ACCOUNT)
      .setupDraft.write(undefined as unknown as SetupRecordValues['setupDraft'])
    // What the extension would hold: `{"savedAt":…}`, with no `value` key.
    storedValues(storage).forEach((stored) => expect(stored).not.toHaveProperty('value'))
    expect(await records.setup(CHAIN_ID, ACCOUNT).setupDraft.read()).toBe(ABSENT)
  })

  it('a record stored at savedAt 0 still reads as present', async () => {
    const { records } = setup({ t: 0 })
    await records.setup(CHAIN_ID, ACCOUNT).inventory.write([])
    const read = present(await records.setup(CHAIN_ID, ACCOUNT).inventory.read())
    expect(read.savedAt).toBe(0)
    expect(read.value).toEqual([])
  })

  it('a bare false or 0 left under a record key reads as absent, never as a fact', async () => {
    const { storage, records } = setup()
    await records.setup(CHAIN_ID, ACCOUNT).passwordSet.write('password-set')
    const [key] = [...storage.raw.keys()]
    await storage.set(key, false)
    expect(await records.setup(CHAIN_ID, ACCOUNT).passwordSet.read()).toBe(ABSENT)
    await storage.set(key, 0)
    expect(await records.setup(CHAIN_ID, ACCOUNT).passwordSet.read()).toBe(ABSENT)
  })

  it('every value the records write is a truthy object', async () => {
    const { storage, records } = setup()
    await writeAllSetup(records)
    await records.setup(CHAIN_ID, OTHER_ACCOUNT).waitingPeriod.write(0n)
    await writeSession(records, GATHERING)
    await landSession(records)
    await records.decryptedSetupCache(CHAIN_ID, ACCOUNT).write(CACHE)
    await writeSession(records, gathering(OTHER_ACCOUNT, []), OTHER_ACCOUNT)
    await wipeSession(records, 'deadline-passed', OTHER_ACCOUNT)
    expect(storage.raw.size).toBeGreaterThanOrEqual(10)
    storedValues(storage).forEach((value) => {
      expect(typeof value).toBe('object')
      expect(value).not.toBeNull()
      expect(!value).toBe(false)
    })
  })
})

describe('the recovery session', () => {
  it('round-trips the approvals and the predicted attempt id', async () => {
    const { storage, records } = setup()
    await writeSession(records, GATHERING)
    const read = present(await records.recoverySession(CHAIN_ID, ACCOUNT).read())
    expect(read.savedAt).toBe(T0)
    expect(read.value).toEqual({ state: 'live', gathering: GATHERING })
    if (read.value.state !== 'live') throw new Error('expected a live session')
    expect(read.value.gathering.replies).toEqual(APPROVALS)
    expect(read.value.gathering.replies.map((r) => r.proof)).toEqual([PROOF_A, PROOF_B])
    expect(predictedAttemptId(read.value)).toBe(PREDICTED_ATTEMPT_ID)
    expect(dump(storage)).toContain(PROOF_A)
  })

  it('reads as absent before any write', async () => {
    const { records } = setup()
    expect(await records.recoverySession(CHAIN_ID, ACCOUNT).read()).toBe(ABSENT)
  })

  it('gathers approvals across writes of the same request', async () => {
    const { records } = setup()
    await writeSession(records, gathering(ACCOUNT, [APPROVALS[0]]))
    await writeSession(records, GATHERING)
    const read = present(await records.recoverySession(CHAIN_ID, ACCOUNT).read())
    expect(read.value).toEqual({ state: 'live', gathering: GATHERING })
  })

  it('a write never replaces a live request: that would be a sixth wipe', async () => {
    const { storage, records } = setup()
    await writeSession(records, GATHERING)
    const before = dump(storage)
    await expect(writeSession(records, gathering(ACCOUNT, [], { attemptId: '8' }))).rejects.toThrow(
      /holds another request/
    )
    await expect(
      writeSession(records, gathering(ACCOUNT, [], { validUntil: '1800000000' }))
    ).rejects.toThrow(/holds another request/)
    expect(dump(storage)).toBe(before)
  })

  it('a write refuses a gathering for another account or chain, or a cancellation', async () => {
    const { storage, records } = setup()
    await expect(writeSession(records, gathering(OTHER_ACCOUNT))).rejects.toThrow(/names account/)
    await expect(
      writeSession(records, gathering(ACCOUNT, APPROVALS, { chainId: '1' }))
    ).rejects.toThrow(/names chain/)
    await expect(writeSession(records, { ...GATHERING, purpose: 'cancellation' })).rejects.toThrow(
      /approval gathering, not cancellation/
    )
    expect(storage.raw.size).toBe(0)
  })

  it('a write takes a gathering whose request names the account in another letter case', async () => {
    const pairs: [Address, Address][] = [
      [LOWER, CHECKSUMMED],
      [CHECKSUMMED, MISCASED],
      [MISCASED, LOWER]
    ]
    await Promise.all(
      pairs.map(async ([account, named]) => {
        const { records } = setup()
        await writeSession(records, gathering(named, []), account)
        expect(present(await records.recoverySession(CHAIN_ID, LOWER).read()).value).toEqual({
          state: 'live',
          gathering: gathering(named, [])
        })
      })
    )
  })

  it('a write refuses a gathering whose request names no valid account, and writes nothing', async () => {
    const { storage, records } = setup()
    await expect(writeSession(records, gathering('0x123'))).rejects.toThrow(
      /^The gathering names account 0x123, not /
    )
    expect(storage.raw.size).toBe(0)
  })

  it('a write refuses a gathering whose request names the account with a 0X prefix, and writes nothing', async () => {
    const { storage, records } = setup()
    const upperPrefix = `0X${ACCOUNT.slice(2)}` as Address
    await expect(writeSession(records, gathering(upperPrefix))).rejects.toThrow(
      new RegExp(`^The gathering names account ${upperPrefix}, not `)
    )
    expect(storage.raw.size).toBe(0)
  })

  FIVE_EVENTS.forEach((event) =>
    describe(`the ${event} event`, () => {
      it('wipes the approvals and the predicted attempt id and keeps exactly its reason line', async () => {
        const { storage, records } = setup()
        await writeSession(records, GATHERING)
        await wipeFor(records, event)
        const read = present(await records.recoverySession(CHAIN_ID, ACCOUNT).read())
        expect(read.value).toEqual(wipedLine(event))
        const text = dump(storage)
        expect(text).not.toContain(PROOF_A)
        expect(text).not.toContain(PROOF_B)
        expect(text).not.toContain('gathering')
        expect(text).not.toContain('replies')
        expect(text).not.toContain('attemptId')
        expect(text).not.toContain('setupBody')
        expect(text).not.toContain('digest')
      })
    })
  )

  it('a later wipe keeps only its own reason, one line and not a list', async () => {
    const { records } = setup()
    await writeSession(records, GATHERING)
    await wipeSession(records, 'deadline-passed')
    await writeSession(records, GATHERING)
    await wipeSession(records, 'setup-changed')
    expect(present(await records.recoverySession(CHAIN_ID, ACCOUNT).read()).value).toEqual(
      wipedLine('setup-changed')
    )
  })

  it('the session lives in storage alone: a fresh instance after a worker restart resumes it with its age', async () => {
    const { storage, records, clock } = setup()
    await writeSession(records, GATHERING)
    const before = dump(storage)
    clock.t = T0 + 10 * HOUR
    // A worker restart drops every in-memory object; only the storage stays.
    const restarted = createWalletRecords({ storage, now: () => clock.t })
    const read = present(await restarted.recoverySession(CHAIN_ID, ACCOUNT).read())
    expect(read.value).toEqual({ state: 'live', gathering: GATHERING })
    expect(await restarted.recoverySession(CHAIN_ID, ACCOUNT).age()).toBe(10 * HOUR)
    expect(await restarted.listRecoverySessions(CHAIN_ID)).toHaveLength(1)
    // Reading and resuming wrote nothing: a pause is not a write.
    expect(dump(storage)).toBe(before)
  })

  it('a wipe with no session writes nothing and reports that it wiped nothing', async () => {
    const { storage, records } = setup()
    const wiped = await wipeSession(records, 'deadline-passed')
    expect(wiped).toBe(false)
    expect(storage.raw.size).toBe(0)
    expect(await records.recoverySession(CHAIN_ID, ACCOUNT).read()).toBe(ABSENT)
  })

  DIRECT_EVENTS.forEach((event) =>
    it(`a wipe of a live session for ${event} reports that it wiped`, async () => {
      const { records } = setup()
      await writeSession(records, GATHERING)
      expect(await wipeSession(records, event)).toBe(true)
    })
  )

  it('a wipe after the submission landed changes nothing: the reason and the countdown stay', async () => {
    const { storage, records } = setup()
    await writeSession(records, GATHERING)
    await landSession(records)
    const before = dump(storage)
    expect(await wipeSession(records, 'deadline-passed')).toBe(false)
    expect(dump(storage)).toBe(before)
    expect(present(await records.recoverySession(CHAIN_ID, ACCOUNT).read()).value).toEqual(
      wipedLine('submission-landed')
    )
    expect(present(await records.countdown(CHAIN_ID, ACCOUNT).read()).value).toEqual({
      account: ACCOUNT
    })
  })

  it('two accounts on one chain keep two sessions, with no silent overwrite', async () => {
    const { storage, records } = setup()
    const other = gathering(OTHER_ACCOUNT, [reply(0, PROOF_B, OTHER_ACCOUNT)])
    await writeSession(records, GATHERING)
    await writeSession(records, other, OTHER_ACCOUNT)
    expect(present(await records.recoverySession(CHAIN_ID, ACCOUNT).read()).value).toEqual({
      state: 'live',
      gathering: GATHERING
    })
    expect(present(await records.recoverySession(CHAIN_ID, OTHER_ACCOUNT).read()).value).toEqual({
      state: 'live',
      gathering: other
    })
    const listed = await records.listRecoverySessions(CHAIN_ID)
    expect(listed.map((l) => l.account.toLowerCase()).sort()).toEqual(
      [ACCOUNT, OTHER_ACCOUNT].map((a) => a.toLowerCase()).sort()
    )
    // A wipe on one account leaves the other live.
    await wipeSession(records, 'recoverer-abandoned')
    expect(present(await records.recoverySession(CHAIN_ID, OTHER_ACCOUNT).read()).value).toEqual({
      state: 'live',
      gathering: other
    })
    expect(dump(storage)).toContain(PROOF_B)
    expect(dump(storage)).not.toContain(PROOF_A)
    // Another chain holds nothing of either.
    expect(await records.listRecoverySessions(1n)).toEqual([])
  })

  it('the death states render from the reason line alone: expired, void, setup changed', async () => {
    expect(WIPE_REASON_STRING_KEYS['deadline-passed']?.title).toMatch(/expired/i)
    expect(WIPE_REASON_STRING_KEYS['another-attempt-opened']?.title).toMatch(/void/i)
    expect(WIPE_REASON_STRING_KEYS['setup-changed']?.title).toMatch(/setupChanged/)
    const strings = (en as { socialRecovery: { records: Record<string, string> } }).socialRecovery
      .records
    Object.values(WIPE_REASON_STRING_KEYS).forEach((keys) => {
      if (!keys) return
      ;[keys.title, keys.body].forEach((k) => {
        expect(k.startsWith('socialRecovery.records.')).toBe(true)
        expect(typeof strings[k.slice('socialRecovery.records.'.length)]).toBe('string')
      })
    })
    // The expired body interpolates the deadline, which the wiped line carries.
    expect(strings.expiredBody).toContain('{{deadline}}')
    const { records } = setup()
    await writeSession(records, GATHERING)
    await wipeSession(records, 'deadline-passed')
    const line = present(await records.recoverySession(CHAIN_ID, ACCOUNT).read()).value
    expect(line).toMatchObject({ reason: 'deadline-passed', deadline: VALID_UNTIL })
  })
})

describe('the countdown record after the submission lands', () => {
  it('holds the account address alone and the session is gone', async () => {
    const { records } = setup()
    await writeSession(records, GATHERING)
    await landSession(records)
    const countdown = present(await records.countdown(CHAIN_ID, ACCOUNT).read())
    expect(countdown.value).toEqual({ account: ACCOUNT })
    expect(countdown.savedAt).toBe(T0)
    expect(present(await records.recoverySession(CHAIN_ID, ACCOUNT).read()).value).toEqual(
      wipedLine('submission-landed')
    )
    const listed = await records.listCountdowns(CHAIN_ID)
    expect(listed).toHaveLength(1)
    expect(listed[0].record.value).toEqual({ account: ACCOUNT })
  })

  it('takes the account from the live session', async () => {
    const { records } = setup()
    const checksummed = '0xAbCdEf0000000000000000000000000000000001' as Address
    await writeSession(records, gathering(checksummed, []), checksummed)
    await landSession(records, checksummed.toLowerCase() as Address)
    expect(present(await records.countdown(CHAIN_ID, checksummed).read()).value).toEqual({
      account: checksummed
    })
  })

  it('refuses a landing with no live session and writes nothing', async () => {
    const { storage, records } = setup()
    await expect(landSession(records)).rejects.toThrow(/No live recovery session/)
    expect(storage.raw.size).toBe(0)
    await writeSession(records, GATHERING)
    await wipeSession(records, 'recoverer-abandoned')
    const before = dump(storage)
    await expect(landSession(records)).rejects.toThrow(/No live recovery session/)
    expect(dump(storage)).toBe(before)
    expect(await records.countdown(CHAIN_ID, ACCOUNT).read()).toBe(ABSENT)
  })

  DIRECT_EVENTS.forEach((event) =>
    it(`no countdown record follows ${event}`, async () => {
      const { records } = setup()
      await writeSession(records, GATHERING)
      await wipeSession(records, event)
      expect(await records.countdown(CHAIN_ID, ACCOUNT).read()).toBe(ABSENT)
      expect(await records.listCountdowns(CHAIN_ID)).toEqual([])
    })
  )

  it('ends with endCountdown, and leaves the listing empty', async () => {
    const { records } = setup()
    await writeSession(records, GATHERING)
    await landSession(records)
    expect(await endSessionCountdown(records)).toBe(true)
    expect(await records.countdown(CHAIN_ID, ACCOUNT).read()).toBe(ABSENT)
    expect(await records.listCountdowns(CHAIN_ID)).toEqual([])
  })

  it('reports its age from the landing', async () => {
    const { records, clock } = setup()
    await writeSession(records, GATHERING)
    clock.t = T0 + HOUR
    await landSession(records)
    expect(await records.countdown(CHAIN_ID, ACCOUNT).age(T0 + 4 * HOUR)).toBe(3 * HOUR)
  })

  it('a new gathering cannot overwrite a landed session: the countdown stays', async () => {
    const { storage, records } = setup()
    await writeSession(records, GATHERING)
    await landSession(records)
    const before = dump(storage)
    await expect(writeSession(records, gathering(ACCOUNT, [], { attemptId: '8' }))).rejects.toThrow(
      /landed session holds the countdown/
    )
    expect(dump(storage)).toBe(before)
    expect(present(await records.countdown(CHAIN_ID, ACCOUNT).read()).value).toEqual({
      account: ACCOUNT
    })
  })

  it('a second landing is refused and changes nothing', async () => {
    const { storage, records } = setup()
    await writeSession(records, GATHERING)
    await landSession(records)
    const before = dump(storage)
    await expect(landSession(records)).rejects.toThrow(/No live recovery session/)
    expect(dump(storage)).toBe(before)
  })
})

describe('the decrypted setup cache after execution', () => {
  it('reads as absent before any write', async () => {
    const { records } = setup()
    expect(await records.decryptedSetupCache(CHAIN_ID, ACCOUNT).read()).toBe(ABSENT)
  })

  it('holds the decrypted setup and its nonce as bigints, readable without the password after a worker restart', async () => {
    const { storage, records, clock } = setup()
    await records.decryptedSetupCache(CHAIN_ID, ACCOUNT).write(CACHE)
    // The stored string carries the configuration, not a pointer to it.
    expect(dump(storage)).toContain(METHOD)
    clock.t = T0 + 2 * HOUR
    const restarted = createWalletRecords({ storage, now: () => clock.t })
    const cache = present(await restarted.decryptedSetupCache(CHAIN_ID, ACCOUNT).read())
    expect(cache.value).toEqual(CACHE)
    expect(typeof cache.value.configuration.wait).toBe('bigint')
    expect(cache.value.setupNonce).toBe(3n)
    expect(await restarted.decryptedSetupCache(CHAIN_ID, ACCOUNT).age()).toBe(2 * HOUR)
  })

  it('is this account on this chain alone: another account or chain has no cache', async () => {
    const { records } = setup()
    await records.decryptedSetupCache(CHAIN_ID, ACCOUNT).write(CACHE)
    expect(await records.decryptedSetupCache(CHAIN_ID, OTHER_ACCOUNT).read()).toBe(ABSENT)
    expect(await records.decryptedSetupCache(1n, ACCOUNT).read()).toBe(ABSENT)
  })

  it('a re-import from the chain replaces the cache and restamps its age', async () => {
    const { records, clock } = setup()
    await records.decryptedSetupCache(CHAIN_ID, ACCOUNT).write(CACHE)
    clock.t = T0 + HOUR
    const reimported: DecryptedSetupCacheRecord = {
      configuration: { ...CONFIGURATION, wait: 172800n },
      setupNonce: 4n
    }
    await records.decryptedSetupCache(CHAIN_ID, ACCOUNT).write(reimported)
    const cache = present(await records.decryptedSetupCache(CHAIN_ID, ACCOUNT).read())
    expect(cache.value).toEqual(reimported)
    expect(cache.savedAt).toBe(T0 + HOUR)
  })

  it('outlives the recovery: after the landing, the countdown ending and the setup wipes, the cache still reads', async () => {
    const { records } = setup()
    await writeSession(records, GATHERING)
    await landSession(records)
    // The recovery executes: the unlocked setup becomes this device's cache
    // and the countdown ends.
    await records.decryptedSetupCache(CHAIN_ID, ACCOUNT).write(CACHE)
    expect(await endSessionCountdown(records)).toBe(true)
    expect(await records.countdown(CHAIN_ID, ACCOUNT).read()).toBe(ABSENT)
    await records.saveSetup(CHAIN_ID, ACCOUNT)
    await records.startOverSetup(CHAIN_ID, ACCOUNT)
    const cache = present(await records.decryptedSetupCache(CHAIN_ID, ACCOUNT).read())
    expect(cache.value).toEqual(CACHE)
  })
})

describe('the session survives the submission as the countdown record, with no index record', () => {
  const landAndReset = async () => {
    const ctx = setup()
    await writeSession(ctx.records, GATHERING)
    ctx.storage.calls.set.length = 0
    ctx.storage.calls.remove.length = 0
    await landSession(ctx.records)
    return ctx
  }

  it('landing is one write: a single set call, no remove', async () => {
    const { storage } = await landAndReset()
    expect(storage.calls.set).toHaveLength(1)
    expect(storage.calls.remove).toEqual([])
  })

  it('the landed session record holds the account address alone, and the countdown reads back from it', async () => {
    const { storage, records } = await landAndReset()
    // One record on this device: the session's own key.
    expect(storage.raw.size).toBe(1)
    const [key] = [...storage.raw.keys()]
    expect(key).toBe(storage.calls.set[0])
    expect(present(await records.recoverySession(CHAIN_ID, ACCOUNT).read()).value).toEqual({
      state: 'landed',
      account: ACCOUNT
    })
    expect(present(await records.countdown(CHAIN_ID, ACCOUNT).read()).value).toEqual({
      account: ACCOUNT
    })
    const text = dump(storage)
    expect(text).not.toContain(PROOF_A)
    expect(text).not.toContain('attemptId')
  })

  it('listCountdowns and listRecoverySessions come from a prefix scan, with no index key present', async () => {
    const { storage, records } = setup()
    await storage.set(PLATFORM_CREDENTIALS_KEY, PLATFORM_CREDENTIALS)
    await writeSession(records, GATHERING)
    await landSession(records)
    await writeSession(
      records,
      gathering(OTHER_ACCOUNT, [reply(0, PROOF_B, OTHER_ACCOUNT)]),
      OTHER_ACCOUNT
    )
    await writeSession(records, gathering(ACCOUNT, [], { chainId: '1' }), ACCOUNT, 1n)
    await landSession(records, ACCOUNT, 1n)
    expect([...storage.raw.keys()].filter((k) => /index/i.test(k))).toEqual([])
    const countdowns = await records.listCountdowns(CHAIN_ID)
    expect(countdowns.map((c) => c.account.toLowerCase())).toEqual([ACCOUNT.toLowerCase()])
    const sessions = await records.listRecoverySessions(CHAIN_ID)
    expect(sessions.map((s) => s.account.toLowerCase()).sort()).toEqual(
      [ACCOUNT, OTHER_ACCOUNT].map((a) => a.toLowerCase()).sort()
    )
  })

  it('the scan skips a key under the prefix that names no account, and a value that is no session', async () => {
    const { storage, records } = await landAndReset()
    await storage.set(`socialRecovery:recoverySession:${CHAIN_ID}:junk`, {
      value: { state: 'landed', account: OTHER_ACCOUNT },
      savedAt: T0,
      revision: 'a'.repeat(24)
    })
    await storage.set(`socialRecovery:recoverySession:${CHAIN_ID}:${OTHER_ACCOUNT.toLowerCase()}`, {
      value: { state: 'unknown' },
      savedAt: T0,
      revision: 'b'.repeat(24)
    })
    const sessions = await records.listRecoverySessions(CHAIN_ID)
    expect(sessions.map((s) => s.account.toLowerCase())).toEqual([ACCOUNT.toLowerCase()])
  })

  const SESSIONS_PREFIX = `socialRecovery:recoverySession:${CHAIN_ID}:`
  const landedRecord = (account: Address) => ({
    value: { state: 'landed', account },
    savedAt: T0,
    revision: 'a'.repeat(24)
  })

  it('the scan skips a key whose address part is not an address', async () => {
    const { storage, records } = await landAndReset()
    const notAddresses = [
      '',
      '0x',
      '0x123',
      `${LOWER}00`,
      LOWER.slice(2),
      `0x${'g'.repeat(40)}`,
      ` ${LOWER}`,
      `${LOWER}:${LOWER}`
    ]
    await Promise.all(
      notAddresses.map((part) => storage.set(`${SESSIONS_PREFIX}${part}`, landedRecord(LOWER)))
    )
    expect((await records.listRecoverySessions(CHAIN_ID)).map((s) => s.account)).toEqual([ACCOUNT])
    expect((await records.listCountdowns(CHAIN_ID)).map((c) => c.account)).toEqual([ACCOUNT])
  })

  it('the scan finds a key whose address is in lower case, in its checksum or in a mixed case that fails the checksum', async () => {
    const { storage, records } = setup()
    const spellings: Address[] = [
      '0xdbf03b407c01e7cd3cbea99509d93f8dddc8c6fb',
      CHECKSUMMED,
      '0xFB6916095ca1df60bB79Ce92cE3Ea74c37c5d359'
    ]
    await Promise.all(
      spellings.map((account) => storage.set(`${SESSIONS_PREFIX}${account}`, landedRecord(account)))
    )
    const expected = [...spellings].sort()
    const sessions = await records.listRecoverySessions(CHAIN_ID)
    expect(sessions.map((s) => s.account).sort()).toEqual(expected)
    const countdowns = await records.listCountdowns(CHAIN_ID)
    expect(countdowns.map((c) => c.account).sort()).toEqual(expected)
  })

  it('a storage without getAll cannot list, and says so', async () => {
    const { storage } = setup()
    const { getAll, ...withoutGetAll } = storage
    expect(getAll).toBeDefined()
    const records = createWalletRecords({ storage: withoutGetAll, now: () => T0 })
    await expect(records.listRecoverySessions(CHAIN_ID)).rejects.toThrow(/getAll/)
    await expect(records.listCountdowns(CHAIN_ID)).rejects.toThrow(/getAll/)
  })

  it('every wipe is one write too', async () => {
    const { storage, records } = setup()
    await writeSession(records, GATHERING)
    storage.calls.set.length = 0
    await wipeSession(records, 'setup-changed')
    expect(storage.calls.set).toHaveLength(1)
    expect(storage.calls.remove).toEqual([])
  })

  it('the scan finds a record written before this instance existed', async () => {
    const { storage } = await landAndReset()
    const restarted = createWalletRecords({ storage, now: () => T0 })
    const listed = await restarted.listCountdowns(CHAIN_ID)
    expect(listed).toHaveLength(1)
    expect(listed[0].record.value).toEqual({ account: ACCOUNT })
  })
})

describe('a live request is compared whole, and its replies only grow', () => {
  const REQUEST_VARIANTS: [string, Partial<Gathering['request']>][] = [
    ['setupBody', { setupBody: '0x01' }],
    ['digestVersion', { digestVersion: '2' }],
    ['payload', { payload: '0x1234' }],
    ['block hash', { block: { number: 1, timestamp: '1700000000', hash: '0x02' } }]
  ]

  REQUEST_VARIANTS.forEach(([label, change]) =>
    it(`two requests in the same block that differ only in ${label} are told apart`, async () => {
      const { storage, records } = setup()
      await writeSession(records, GATHERING)
      const before = dump(storage)
      await expect(writeSession(records, gathering(ACCOUNT, APPROVALS, change))).rejects.toThrow(
        /holds another request/
      )
      expect(dump(storage)).toBe(before)
    })
  )

  const blockWithUndefined = { ...GATHERING.request.block, note: undefined }
  const UNDEFINED_KEYS: [string, Partial<Gathering['request']>][] = [
    ['an optional key', { payload: undefined }],
    ['every optional key', { payload: undefined, order: undefined, consumableAfter: undefined }],
    ['a key inside the block', { block: blockWithUndefined }]
  ]

  UNDEFINED_KEYS.forEach(([label, change]) =>
    it(`a request that differs only by ${label} holding undefined is the same request`, async () => {
      const { records } = setup()
      await writeSession(records, gathering(ACCOUNT, [APPROVALS[0]]))
      await writeSession(records, gathering(ACCOUNT, APPROVALS, change))
      expect(present(await records.recoverySession(CHAIN_ID, ACCOUNT).read()).value).toEqual({
        state: 'live',
        gathering: GATHERING
      })
    })
  )

  it('a request that differs by a key holding null is another request', async () => {
    const { storage, records } = setup()
    await writeSession(records, gathering(ACCOUNT, [APPROVALS[0]]))
    const before = dump(storage)
    await expect(
      writeSession(records, gathering(ACCOUNT, APPROVALS, { payload: null as unknown as Hex }))
    ).rejects.toThrow(/holds another request/)
    expect(dump(storage)).toBe(before)
  })

  it('inside an array, undefined and null count as the same entry, since the storage keeps both as null', async () => {
    const { storage, records } = setup()
    // The request type holds no array, so the list goes in through a cast.
    const withList = (list: unknown[]) => ({ list } as unknown as Partial<Gathering['request']>)
    await writeSession(records, gathering(ACCOUNT, [], withList(['0x01', undefined])))
    await writeSession(records, gathering(ACCOUNT, [APPROVALS[0]], withList(['0x01', undefined])))
    await writeSession(records, gathering(ACCOUNT, APPROVALS, withList(['0x01', null])))
    expect(present(await records.recoverySession(CHAIN_ID, ACCOUNT).read()).value).toEqual({
      state: 'live',
      gathering: gathering(ACCOUNT, APPROVALS, withList(['0x01', null]))
    })
    const before = dump(storage)
    await expect(
      writeSession(records, gathering(ACCOUNT, APPROVALS, withList(['0x01'])))
    ).rejects.toThrow(/holds another request/)
    await expect(
      writeSession(records, gathering(ACCOUNT, APPROVALS, withList(['0x01', '0x02'])))
    ).rejects.toThrow(/holds another request/)
    expect(dump(storage)).toBe(before)
  })

  const withoutRequest = Object.fromEntries(
    Object.entries(GATHERING).filter(([key]) => key !== 'request')
  )
  ;(
    [
      ['no request', withoutRequest],
      ['a null request', { ...GATHERING, request: null }]
    ] as const
  ).forEach(([label, stored]) =>
    it(`a stored live session with ${label} is refused as holding another request, and nothing is written`, async () => {
      const { storage, records } = setup()
      await storage.set(recordKeys.recoverySession(CHAIN_ID, ACCOUNT), {
        value: { state: 'live', gathering: stored },
        savedAt: T0,
        revision: 'c'.repeat(24)
      })
      const before = dump(storage)
      storage.calls.set.length = 0
      await expect(writeSession(records, GATHERING)).rejects.toThrow(
        /^A live session holds another request: wipe it/
      )
      expect(storage.calls.set).toEqual([])
      expect(dump(storage)).toBe(before)
    })
  )

  it('a write with fewer replies is refused', async () => {
    const { storage, records } = setup()
    await writeSession(records, GATHERING)
    const before = dump(storage)
    await expect(writeSession(records, gathering(ACCOUNT, [APPROVALS[0]]))).rejects.toThrow(
      /drops the reply at place 1$/
    )
    await expect(writeSession(records, gathering(ACCOUNT, []))).rejects.toThrow(
      /drops the reply at place 0, 1$/
    )
    expect(dump(storage)).toBe(before)
  })

  it('a write that swaps a stored reply for another is refused, even at the same count', async () => {
    const { storage, records } = setup()
    await writeSession(records, GATHERING)
    const before = dump(storage)
    const swapped = [APPROVALS[0], reply(2, '0xabababab')]
    await expect(writeSession(records, gathering(ACCOUNT, swapped))).rejects.toThrow(
      /drops the reply at place 1$/
    )
    expect(dump(storage)).toBe(before)
  })

  it('a later reply for the same place displaces the stored one', async () => {
    const { records } = setup()
    await writeSession(records, GATHERING)
    const displaced = gathering(ACCOUNT, [APPROVALS[0], reply(1, '0xabababab')])
    await writeSession(records, displaced)
    expect(present(await records.recoverySession(CHAIN_ID, ACCOUNT).read()).value).toEqual({
      state: 'live',
      gathering: displaced
    })
  })

  it('a write that keeps every stored reply and adds one is taken', async () => {
    const { records } = setup()
    await writeSession(records, gathering(ACCOUNT, [APPROVALS[0]]))
    await writeSession(records, GATHERING)
    expect(present(await records.recoverySession(CHAIN_ID, ACCOUNT).read()).value).toEqual({
      state: 'live',
      gathering: GATHERING
    })
  })
})

describe('clearWipedSession removes only a wiped session', () => {
  it('refuses a live session: reports false, removes nothing and keeps its approvals', async () => {
    const { storage, records } = setup()
    await writeSession(records, GATHERING)
    const before = dump(storage)
    storage.calls.remove.length = 0
    expect(await clearWiped(records)).toBe(false)
    expect(storage.calls.remove).toEqual([])
    expect(dump(storage)).toBe(before)
    expect(dump(storage)).toContain(PROOF_A)
  })

  it('reports false with no session and removes nothing', async () => {
    const { storage, records } = setup()
    expect(await clearWiped(records)).toBe(false)
    expect(storage.calls.remove).toEqual([])
  })

  DIRECT_EVENTS.forEach((event) =>
    it(`clears a session wiped by ${event}`, async () => {
      const { storage, records } = setup()
      await writeSession(records, GATHERING)
      await wipeSession(records, event)
      expect(await clearWiped(records)).toBe(true)
      expect(await records.recoverySession(CHAIN_ID, ACCOUNT).read()).toBe(ABSENT)
      expect(storage.raw.size).toBe(0)
    })
  )

  it('refuses a landed session: reports false and the countdown keeps running', async () => {
    const { storage, records } = setup()
    await writeSession(records, GATHERING)
    await landSession(records)
    const before = dump(storage)
    storage.calls.remove.length = 0
    expect(await clearWiped(records)).toBe(false)
    expect(storage.calls.remove).toEqual([])
    expect(dump(storage)).toBe(before)
    expect(present(await records.countdown(CHAIN_ID, ACCOUNT).read()).value).toEqual({
      account: ACCOUNT
    })
    expect(await records.listCountdowns(CHAIN_ID)).toHaveLength(1)
  })

  it('a loop that clears every non-live session leaves running countdowns in place', async () => {
    const { records } = setup()
    const third = '0x6666666666666666666666666666666666666666' as Address
    // A running countdown, a wiped session and a live session on one chain.
    await writeSession(records, GATHERING)
    await landSession(records)
    await writeSession(records, gathering(OTHER_ACCOUNT, []), OTHER_ACCOUNT)
    await wipeSession(records, 'deadline-passed', OTHER_ACCOUNT)
    const live = gathering(third, [reply(0, PROOF_B, third)])
    await writeSession(records, live, third)
    const listed = await records.listRecoverySessions(CHAIN_ID)
    const cleared = await Promise.all(
      listed
        .filter(({ record }) => record.value.state !== 'live')
        .map(({ account }) => clearWiped(records, account))
    )
    expect(cleared.sort()).toEqual([false, true])
    expect(await records.recoverySession(CHAIN_ID, OTHER_ACCOUNT).read()).toBe(ABSENT)
    expect(present(await records.countdown(CHAIN_ID, ACCOUNT).read()).value).toEqual({
      account: ACCOUNT
    })
    expect((await records.listCountdowns(CHAIN_ID)).map((c) => c.account)).toEqual([ACCOUNT])
    expect(present(await records.recoverySession(CHAIN_ID, third).read()).value).toEqual({
      state: 'live',
      gathering: live
    })
  })

  it('after a clear, a new gathering may start', async () => {
    const { records } = setup()
    await writeSession(records, GATHERING)
    await wipeSession(records, 'another-attempt-opened')
    await clearWiped(records)
    const fresh = gathering(ACCOUNT, [], { attemptId: '8' })
    await writeSession(records, fresh)
    expect(present(await records.recoverySession(CHAIN_ID, ACCOUNT).read()).value).toEqual({
      state: 'live',
      gathering: fresh
    })
  })

  it('leaves another account untouched', async () => {
    const { records } = setup()
    await writeSession(records, GATHERING)
    await wipeSession(records, 'recoverer-abandoned')
    const other = gathering(OTHER_ACCOUNT, [reply(0, PROOF_B, OTHER_ACCOUNT)])
    await writeSession(records, other, OTHER_ACCOUNT)
    await clearWiped(records)
    expect(present(await records.recoverySession(CHAIN_ID, OTHER_ACCOUNT).read()).value).toEqual({
      state: 'live',
      gathering: other
    })
  })
})

describe('endCountdown removes only a landed session', () => {
  it('ends a landed session: reports true, and the listing of countdowns is then empty', async () => {
    const { storage, records } = setup()
    await writeSession(records, GATHERING)
    await landSession(records)
    expect(await endSessionCountdown(records)).toBe(true)
    expect(await records.countdown(CHAIN_ID, ACCOUNT).read()).toBe(ABSENT)
    expect(await records.listCountdowns(CHAIN_ID)).toEqual([])
    expect(storage.raw.size).toBe(0)
  })

  it('refuses a live session: reports false and keeps its approvals', async () => {
    const { storage, records } = setup()
    await writeSession(records, GATHERING)
    const before = dump(storage)
    storage.calls.remove.length = 0
    expect(await endSessionCountdown(records)).toBe(false)
    expect(storage.calls.remove).toEqual([])
    expect(dump(storage)).toBe(before)
  })

  DIRECT_EVENTS.forEach((event) =>
    it(`refuses a session wiped by ${event}: reports false and keeps its reason`, async () => {
      const { storage, records } = setup()
      await writeSession(records, GATHERING)
      await wipeSession(records, event)
      const before = dump(storage)
      storage.calls.remove.length = 0
      expect(await endSessionCountdown(records)).toBe(false)
      expect(storage.calls.remove).toEqual([])
      expect(dump(storage)).toBe(before)
      expect(present(await records.recoverySession(CHAIN_ID, ACCOUNT).read()).value).toEqual(
        wipedLine(event)
      )
    })
  )

  it('reports false with no session and removes nothing', async () => {
    const { storage, records } = setup()
    expect(await endSessionCountdown(records)).toBe(false)
    expect(storage.calls.remove).toEqual([])
  })

  it('ends one account countdown and leaves another running', async () => {
    const { records } = setup()
    await writeSession(records, GATHERING)
    await landSession(records)
    await writeSession(records, gathering(OTHER_ACCOUNT, []), OTHER_ACCOUNT)
    await landSession(records, OTHER_ACCOUNT)
    expect(await endSessionCountdown(records)).toBe(true)
    expect((await records.listCountdowns(CHAIN_ID)).map((c) => c.account)).toEqual([OTHER_ACCOUNT])
  })
})

// Holds the next read of `key` once it has taken the stored value, until
// released: the reader has seen the session but has not yet acted on it.
const holdNextRead = (storage: Pick<RecordStorage, 'get'>, key: string) => {
  const get = storage.get.bind(storage)
  let reached: () => void = () => {}
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    reached = resolve
  })
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  let armed = true
  // eslint-disable-next-line no-param-reassign
  storage.get = async (k, defaultValue) => {
    const value = await get(k, defaultValue)
    if (armed && k === key) {
      armed = false
      reached()
      await released
    }
    return value
  }
  return { held, release }
}

const SESSION_KEY = recordKeys.recoverySession(CHAIN_ID, ACCOUNT)

const repliesOf = (read: SessionRead) => {
  if (read.status !== 'present' || read.value.state !== 'live') {
    throw new Error('expected a live session')
  }
  return read.value.gathering.replies
}

const CONFLICT = { status: 'rejected', reason: expect.any(SessionRevisionConflict) }

type SessionUpdate = (records: Records, revision: ExpectedRevision) => Promise<unknown>

describe('a session update refuses when the session changed after its caller read it', () => {
  it('a reply write from a read taken before a wipe is refused and cannot bring the session back', async () => {
    const { storage, records } = setup()
    await writeSession(records, gathering(ACCOUNT, [APPROVALS[0]]))
    const read = await records.recoverySession(CHAIN_ID, ACCOUNT).read()
    expect(
      await records.wipeRecoverySession(CHAIN_ID, ACCOUNT, 'deadline-passed', revisionOf(read))
    ).toBe(true)
    const wiped = dump(storage)
    await expect(
      records.recoverySession(CHAIN_ID, ACCOUNT).write(GATHERING, revisionOf(read))
    ).rejects.toBeInstanceOf(SessionRevisionConflict)
    expect(dump(storage)).toBe(wiped)
    expect(wiped).not.toContain(PROOF_A)
    expect(present(await records.recoverySession(CHAIN_ID, ACCOUNT).read()).value).toEqual(
      wipedLine('deadline-passed')
    )
  })

  it('a wipe that arrives while a reply write runs waits for it, is refused, and wipes on a retry from a fresh read', async () => {
    const { storage, records } = setup()
    await writeSession(records, gathering(ACCOUNT, [APPROVALS[0]]))
    const read = await records.recoverySession(CHAIN_ID, ACCOUNT).read()
    const hold = holdNextRead(storage, SESSION_KEY)
    const write = records.recoverySession(CHAIN_ID, ACCOUNT).write(GATHERING, revisionOf(read))
    await hold.held
    const wipe = records.wipeRecoverySession(CHAIN_ID, ACCOUNT, 'deadline-passed', revisionOf(read))
    hold.release()
    const [written, wiped] = await Promise.allSettled([write, wipe])
    expect(written).toMatchObject({ status: 'fulfilled' })
    expect(wiped).toMatchObject(CONFLICT)
    expect(await wipeSession(records, 'deadline-passed')).toBe(true)
    expect(present(await records.recoverySession(CHAIN_ID, ACCOUNT).read()).value).toEqual(
      wipedLine('deadline-passed')
    )
    expect(dump(storage)).not.toContain(PROOF_A)
    expect(dump(storage)).not.toContain(PROOF_B)
  })

  it('a late reply write from a read taken before the landing is refused and the countdown stays', async () => {
    const { storage, records } = setup()
    await writeSession(records, gathering(ACCOUNT, [APPROVALS[0]]))
    const read = await records.recoverySession(CHAIN_ID, ACCOUNT).read()
    const landed = await records.landSubmission(CHAIN_ID, ACCOUNT, revisionOf(read))
    const before = dump(storage)
    await expect(
      records.recoverySession(CHAIN_ID, ACCOUNT).write(GATHERING, revisionOf(read))
    ).rejects.toBeInstanceOf(SessionRevisionConflict)
    expect(dump(storage)).toBe(before)
    expect(before).not.toContain(PROOF_A)
    const countdown = await records.countdown(CHAIN_ID, ACCOUNT).read()
    expect(present(countdown).value).toEqual({ account: ACCOUNT })
    expect(revisionOf(countdown)).toBe(landed.revision)
  })

  it('a landing that arrives while a reply write runs waits for it, is refused, and lands on a retry from a fresh read', async () => {
    const { storage, records } = setup()
    await writeSession(records, gathering(ACCOUNT, [APPROVALS[0]]))
    const read = await records.recoverySession(CHAIN_ID, ACCOUNT).read()
    const hold = holdNextRead(storage, SESSION_KEY)
    const write = records.recoverySession(CHAIN_ID, ACCOUNT).write(GATHERING, revisionOf(read))
    await hold.held
    const landing = records.landSubmission(CHAIN_ID, ACCOUNT, revisionOf(read))
    hold.release()
    const [written, landed] = await Promise.allSettled([write, landing])
    expect(written).toMatchObject({ status: 'fulfilled' })
    expect(landed).toMatchObject(CONFLICT)
    await landSession(records)
    expect(present(await records.countdown(CHAIN_ID, ACCOUNT).read()).value).toEqual({
      account: ACCOUNT
    })
    expect(dump(storage)).not.toContain(PROOF_A)
    expect(dump(storage)).not.toContain(PROOF_B)
  })

  it('two reply writes from one read: the second is refused, and a retry from a fresh read keeps both replies', async () => {
    const { storage, records } = setup()
    await writeSession(records, gathering(ACCOUNT, []))
    const read = await records.recoverySession(CHAIN_ID, ACCOUNT).read()
    const session = records.recoverySession(CHAIN_ID, ACCOUNT)
    const hold = holdNextRead(storage, SESSION_KEY)
    const first = session.write(gathering(ACCOUNT, [APPROVALS[0]]), revisionOf(read))
    await hold.held
    const second = session.write(gathering(ACCOUNT, [APPROVALS[1]]), revisionOf(read))
    hold.release()
    const [firstOutcome, secondOutcome] = await Promise.allSettled([first, second])
    expect(firstOutcome).toMatchObject({ status: 'fulfilled' })
    expect(secondOutcome).toMatchObject(CONFLICT)
    const fresh = await session.read()
    await session.write(gathering(ACCOUNT, [...repliesOf(fresh), APPROVALS[1]]), revisionOf(fresh))
    const replies = repliesOf(await session.read())
    expect(replies.map((r) => r.place)).toEqual([0, 1])
    expect(replies.map((r) => r.proof)).toEqual([PROOF_A, PROOF_B])
  })

  it('a write, a wipe or a landing that names a stale revision is refused with the conflict and writes nothing', async () => {
    const { storage, records } = setup()
    const session = records.recoverySession(CHAIN_ID, ACCOUNT)
    const first = await session.write(gathering(ACCOUNT, [APPROVALS[0]]), null)
    await session.write(GATHERING, first.revision)
    const before = dump(storage)
    const stale = first.revision
    const outcomes = await Promise.allSettled([
      session.write(GATHERING, stale),
      session.write(GATHERING, null),
      records.wipeRecoverySession(CHAIN_ID, ACCOUNT, 'deadline-passed', stale),
      records.landSubmission(CHAIN_ID, ACCOUNT, stale)
    ])
    expect(
      outcomes.map((o) => o.status === 'rejected' && isSessionRevisionConflict(o.reason))
    ).toEqual([true, true, true, true])
    expect(dump(storage)).toBe(before)
    expect(present(await session.read()).value).toEqual({ state: 'live', gathering: GATHERING })
  })

  it('a clear of a wiped session or an end of a landed one that names a stale revision is refused with the conflict', async () => {
    const { storage, records } = setup()
    await writeSession(records, GATHERING)
    const liveRead = await records.recoverySession(CHAIN_ID, ACCOUNT).read()
    await wipeSession(records, 'recoverer-abandoned')
    await writeSession(records, gathering(OTHER_ACCOUNT, []), OTHER_ACCOUNT)
    const otherLiveRead = await records.recoverySession(CHAIN_ID, OTHER_ACCOUNT).read()
    await landSession(records, OTHER_ACCOUNT)
    const before = dump(storage)
    await expect(
      records.clearWipedSession(CHAIN_ID, ACCOUNT, revisionOf(liveRead))
    ).rejects.toBeInstanceOf(SessionRevisionConflict)
    await expect(
      records.endCountdown(CHAIN_ID, OTHER_ACCOUNT, revisionOf(otherLiveRead))
    ).rejects.toBeInstanceOf(SessionRevisionConflict)
    await expect(records.clearWipedSession(CHAIN_ID, ACCOUNT, null)).rejects.toBeInstanceOf(
      SessionRevisionConflict
    )
    expect(dump(storage)).toBe(before)
  })

  it('a clear or an end on a session in another state returns false and writes nothing, whatever revision is passed', async () => {
    const { storage, records } = setup()
    const third = '0x6666666666666666666666666666666666666666' as Address
    const noSession = '0x7777777777777777777777777777777777777777' as Address
    await writeSession(records, GATHERING)
    await writeSession(records, gathering(OTHER_ACCOUNT, []), OTHER_ACCOUNT)
    await wipeSession(records, 'deadline-passed', OTHER_ACCOUNT)
    await writeSession(records, gathering(third, []), third)
    await landSession(records, third)
    const before = dump(storage)
    storage.calls.set.length = 0
    storage.calls.remove.length = 0
    const other = 'f'.repeat(24)
    // A clear touches only a wiped session and an end only a landed one.
    const cases: [SessionUpdate, Address][] = [
      [(r, revision) => r.clearWipedSession(CHAIN_ID, ACCOUNT, revision), ACCOUNT],
      [(r, revision) => r.clearWipedSession(CHAIN_ID, third, revision), third],
      [(r, revision) => r.clearWipedSession(CHAIN_ID, noSession, revision), noSession],
      [(r, revision) => r.endCountdown(CHAIN_ID, ACCOUNT, revision), ACCOUNT],
      [(r, revision) => r.endCountdown(CHAIN_ID, OTHER_ACCOUNT, revision), OTHER_ACCOUNT],
      [(r, revision) => r.endCountdown(CHAIN_ID, noSession, revision), noSession]
    ]
    const results = await Promise.all(
      cases.flatMap(([update, account]) =>
        [null, other].map(async (revision) => [
          await update(records, revision),
          await update(records, await revisionNow(records, account, CHAIN_ID))
        ])
      )
    )
    expect(results.flat().every((result) => result === false)).toBe(true)
    expect(results.flat()).toHaveLength(24)
    expect(storage.calls.set).toEqual([])
    expect(storage.calls.remove).toEqual([])
    expect(dump(storage)).toBe(before)
  })

  it('an end of the countdown from a countdown read that found none returns false while the session is live', async () => {
    const { storage, records } = setup()
    await writeSession(records, GATHERING)
    const countdownRead = await records.countdown(CHAIN_ID, ACCOUNT).read()
    expect(countdownRead).toBe(ABSENT)
    const before = dump(storage)
    expect(await records.endCountdown(CHAIN_ID, ACCOUNT, revisionOf(countdownRead))).toBe(false)
    expect(dump(storage)).toBe(before)
    expect(present(await records.recoverySession(CHAIN_ID, ACCOUNT).read()).value).toEqual({
      state: 'live',
      gathering: GATHERING
    })
    await wipeSession(records, 'setup-changed')
    expect(
      await records.endCountdown(
        CHAIN_ID,
        ACCOUNT,
        revisionOf(await records.countdown(CHAIN_ID, ACCOUNT).read())
      )
    ).toBe(false)
    expect(present(await records.recoverySession(CHAIN_ID, ACCOUNT).read()).value).toEqual(
      wipedLine('setup-changed')
    )
  })

  it('an update that names the revision of a session since removed is refused', async () => {
    const { storage, records } = setup()
    await writeSession(records, GATHERING)
    await wipeSession(records, 'recoverer-abandoned')
    const read = await records.recoverySession(CHAIN_ID, ACCOUNT).read()
    expect(await records.clearWipedSession(CHAIN_ID, ACCOUNT, revisionOf(read))).toBe(true)
    await expect(
      records.recoverySession(CHAIN_ID, ACCOUNT).write(GATHERING, revisionOf(read))
    ).rejects.toBeInstanceOf(SessionRevisionConflict)
    expect(storage.raw.size).toBe(0)
  })

  it('two record instances over one storage object share one queue per session', async () => {
    const { storage, records } = setup()
    const other = createWalletRecords({ storage, now: () => T0 })
    await writeSession(records, gathering(ACCOUNT, [APPROVALS[0]]))
    const read = await records.recoverySession(CHAIN_ID, ACCOUNT).read()
    const hold = holdNextRead(storage, SESSION_KEY)
    const write = records.recoverySession(CHAIN_ID, ACCOUNT).write(GATHERING, revisionOf(read))
    await hold.held
    const wipe = other.wipeRecoverySession(CHAIN_ID, ACCOUNT, 'setup-changed', revisionOf(read))
    hold.release()
    const [written, wiped] = await Promise.allSettled([write, wipe])
    expect(written).toMatchObject({ status: 'fulfilled' })
    expect(wiped).toMatchObject(CONFLICT)
    expect(present(await other.recoverySession(CHAIN_ID, ACCOUNT).read()).value).toEqual({
      state: 'live',
      gathering: GATHERING
    })
  })
})

describe('the revision an update names', () => {
  it('an update that names the empty revision meets the conflict, or returns false for a clear or an end on another state, and writes nothing', async () => {
    const states: [string, (records: Records) => Promise<unknown>][] = [
      ['none', async () => undefined],
      ['live', (records) => writeSession(records, GATHERING)],
      [
        'wiped',
        async (records) => {
          await writeSession(records, GATHERING)
          await wipeSession(records, 'setup-changed')
        }
      ],
      [
        'landed',
        async (records) => {
          await writeSession(records, GATHERING)
          await landSession(records)
        }
      ]
    ]
    const updates: [string, SessionUpdate][] = [
      [
        'a reply write',
        (records, revision) => records.recoverySession(CHAIN_ID, ACCOUNT).write(GATHERING, revision)
      ],
      [
        'a wipe',
        (records, revision) =>
          records.wipeRecoverySession(CHAIN_ID, ACCOUNT, 'deadline-passed', revision)
      ],
      ['a landing', (records, revision) => records.landSubmission(CHAIN_ID, ACCOUNT, revision)],
      ['a clear', (records, revision) => records.clearWipedSession(CHAIN_ID, ACCOUNT, revision)],
      [
        'an end of the countdown',
        (records, revision) => records.endCountdown(CHAIN_ID, ACCOUNT, revision)
      ]
    ]
    const outcomes = await Promise.all(
      updates.map(async ([label, update]) => [
        label,
        Object.fromEntries(
          await Promise.all(
            states.map(async ([state, prepare]) => {
              const { storage, records } = setup()
              await prepare(records)
              const before = dump(storage)
              const outcome = await update(records, '').then(
                (value) => (value === false ? false : 'done'),
                (error: unknown) => (isSessionRevisionConflict(error) ? 'conflict' : String(error))
              )
              expect(dump(storage)).toBe(before)
              return [state, outcome]
            })
          )
        )
      ])
    )
    const conflictInEveryState = {
      none: 'conflict',
      live: 'conflict',
      wiped: 'conflict',
      landed: 'conflict'
    }
    expect(Object.fromEntries(outcomes)).toEqual({
      'a reply write': conflictInEveryState,
      'a wipe': conflictInEveryState,
      'a landing': conflictInEveryState,
      'a clear': { none: false, live: false, wiped: 'conflict', landed: false },
      'an end of the countdown': { none: false, live: false, wiped: false, landed: 'conflict' }
    })
  })

  it('an update may pass the revision a listing gave', async () => {
    const { records } = setup()
    await writeSession(records, GATHERING)
    await writeSession(records, gathering(OTHER_ACCOUNT, []), OTHER_ACCOUNT)
    await landSession(records, OTHER_ACCOUNT)
    const sessions = await records.listRecoverySessions(CHAIN_ID)
    const [live] = sessions.filter(({ record }) => record.value.state === 'live')
    expect(
      await records.wipeRecoverySession(
        CHAIN_ID,
        live.account,
        'recoverer-abandoned',
        live.record.revision
      )
    ).toBe(true)
    const [countdown] = await records.listCountdowns(CHAIN_ID)
    expect(await records.endCountdown(CHAIN_ID, countdown.account, countdown.record.revision)).toBe(
      true
    )
    expect(present(await records.recoverySession(CHAIN_ID, ACCOUNT).read()).value).toEqual(
      wipedLine('recoverer-abandoned')
    )
    expect(await records.countdown(CHAIN_ID, OTHER_ACCOUNT).read()).toBe(ABSENT)
  })

  it('a session stored without a revision reads as absent, is not listed and gives no countdown', async () => {
    const { storage, records } = setup()
    await storage.set(SESSION_KEY, { value: { state: 'live', gathering: GATHERING }, savedAt: T0 })
    await storage.set(recordKeys.recoverySession(CHAIN_ID, OTHER_ACCOUNT), {
      value: { state: 'landed', account: OTHER_ACCOUNT },
      savedAt: T0,
      revision: ''
    })
    expect(await records.recoverySession(CHAIN_ID, ACCOUNT).read()).toBe(ABSENT)
    expect(await records.recoverySession(CHAIN_ID, OTHER_ACCOUNT).read()).toBe(ABSENT)
    expect(await records.countdown(CHAIN_ID, OTHER_ACCOUNT).read()).toBe(ABSENT)
    expect(await records.listRecoverySessions(CHAIN_ID)).toEqual([])
    expect(await records.listCountdowns(CHAIN_ID)).toEqual([])
  })
})

describe('the revision a session update stores', () => {
  it('differs from every revision stored before it', async () => {
    const { records } = setup()
    const session = records.recoverySession(CHAIN_ID, ACCOUNT)
    const first = await session.write(gathering(ACCOUNT, [APPROVALS[0]]), null)
    const second = await session.write(GATHERING, first.revision)
    await records.wipeRecoverySession(CHAIN_ID, ACCOUNT, 'recoverer-abandoned', second.revision)
    const wiped = revisionOf(await session.read())
    const third = await session.write(GATHERING, wiped)
    const landed = await records.landSubmission(CHAIN_ID, ACCOUNT, third.revision)
    const revisions = [first.revision, second.revision, wiped, third.revision, landed.revision]
    expect(new Set(revisions).size).toBe(5)
  })

  it('a session stored with a revision of 24 hex digits and no prefix still reads, lists and takes an update that names it', async () => {
    const { storage, records } = setup()
    const unprefixed = '0123456789abcdef01234567'
    await storage.set(recordKeys.recoverySession(CHAIN_ID, ACCOUNT), {
      value: { state: 'live', gathering: gathering(ACCOUNT, [APPROVALS[0]]) },
      savedAt: T0,
      revision: unprefixed
    })
    const session = records.recoverySession(CHAIN_ID, ACCOUNT)
    expect(revisionOf(await session.read())).toBe(unprefixed)
    const listed = await records.listRecoverySessions(CHAIN_ID)
    expect(listed.map(({ record }) => record.revision)).toEqual([unprefixed])
    const written = await session.write(GATHERING, unprefixed)
    expect(written.revision).not.toBe(unprefixed)
    await expect(session.write(GATHERING, unprefixed)).rejects.toBeInstanceOf(
      SessionRevisionConflict
    )
    expect(present(await session.read()).value).toEqual({ state: 'live', gathering: GATHERING })
  })
})

// Runs `run` with `navigator` set to `value`, then puts the original back.
const withNavigator = async (value: unknown, run: () => Promise<void>) => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true })
  try {
    await run()
  } finally {
    if (saved) Object.defineProperty(globalThis, 'navigator', saved)
    else delete (globalThis as { navigator?: unknown }).navigator
  }
}

// Two reply writes from one read, the first held after its read: the second
// must wait for the first, then meet the conflict; a retry keeps both replies.
const raceTwoReplyWrites = async (
  first: { records: Records; storage: Pick<RecordStorage, 'get'> },
  second: Records
) => {
  await first.records.recoverySession(CHAIN_ID, ACCOUNT).write(gathering(ACCOUNT, []), null)
  const read = await first.records.recoverySession(CHAIN_ID, ACCOUNT).read()
  const hold = holdNextRead(first.storage, SESSION_KEY)
  const write = first.records
    .recoverySession(CHAIN_ID, ACCOUNT)
    .write(gathering(ACCOUNT, [APPROVALS[0]]), revisionOf(read))
  await hold.held
  const other = second
    .recoverySession(CHAIN_ID, ACCOUNT)
    .write(gathering(ACCOUNT, [APPROVALS[1]]), revisionOf(read))
  hold.release()
  const [firstOutcome, secondOutcome] = await Promise.allSettled([write, other])
  expect(firstOutcome).toMatchObject({ status: 'fulfilled' })
  expect(secondOutcome).toMatchObject(CONFLICT)
  const session = second.recoverySession(CHAIN_ID, ACCOUNT)
  const fresh = await session.read()
  await session.write(gathering(ACCOUNT, [...repliesOf(fresh), APPROVALS[1]]), revisionOf(fresh))
  const replies = repliesOf(await first.records.recoverySession(CHAIN_ID, ACCOUNT).read())
  expect(replies.map((r) => r.proof)).toEqual([PROOF_A, PROOF_B])
}

// A stand-in for the Web Locks API that records each lock name and runs one
// task at a time per name, first in first out: the next task starts once the
// previous one has settled.
const exclusiveLocks = () => {
  const names: string[] = []
  const tails = new Map<string, Promise<void>>()
  const request = (name: string, callback: () => Promise<unknown>) => {
    names.push(name)
    const run = (tails.get(name) ?? Promise.resolve()).then(() => callback())
    tails.set(
      name,
      run.then(
        () => undefined,
        () => undefined
      )
    )
    return run
  }
  return { names, request }
}

describe('updates of one session run one at a time, across wrappers and pages', () => {
  it('two wrapper objects over one extension store share one queue per session', async () => {
    await extensionRecordStorage.remove(SESSION_KEY)
    const firstStorage = { ...extensionRecordStorage }
    const first = createWalletRecords({ storage: firstStorage, now: () => T0 })
    const second = createWalletRecords({ storage: { ...extensionRecordStorage }, now: () => T0 })
    await raceTwoReplyWrites({ records: first, storage: firstStorage }, second)
    expect(await extensionRecordStorage.get(SESSION_KEY)).toMatchObject({
      value: { state: 'live', gathering: GATHERING }
    })
    await extensionRecordStorage.remove(SESSION_KEY)
  })

  it('with the Web Locks API, every session update takes the lock named by the session key', async () => {
    const locks = exclusiveLocks()
    await withNavigator({ locks }, async () => {
      const { records } = setup()
      expect(await writeSession(records, gathering(ACCOUNT, [APPROVALS[0]]))).toMatchObject({
        value: { state: 'live' }
      })
      await writeSession(records, GATHERING)
      expect(await wipeSession(records, 'recoverer-abandoned')).toBe(true)
      expect(await clearWiped(records)).toBe(true)
      await writeSession(records, GATHERING)
      expect(await landSession(records)).toMatchObject({ value: { account: ACCOUNT } })
      expect(await endSessionCountdown(records)).toBe(true)
    })
    expect(locks.names).toEqual(Array(7).fill(SESSION_KEY))
  })

  it('with the Web Locks API, two reply writes from one read run one at a time through the lock', async () => {
    const locks = exclusiveLocks()
    await withNavigator({ locks }, async () => {
      const { storage, records } = setup()
      await raceTwoReplyWrites({ records, storage }, records)
    })
    expect(locks.names).toEqual(Array(4).fill(SESSION_KEY))
  })
  ;(
    [
      ['a navigator without the Web Locks API', {}],
      ['no navigator', undefined]
    ] as const
  ).forEach(([label, value]) =>
    it(`with ${label}, updates of one session still run one at a time`, async () => {
      await withNavigator(value, async () => {
        const { storage, records } = setup()
        await raceTwoReplyWrites({ records, storage }, records)
      })
    })
  )
})

describe('the ceremony request under its request id', () => {
  const ID = 'req-1'
  const APPROVER_REQUEST: ApproverRequest = {
    kind: 'recovery-proof-request',
    version: 1,
    purpose: 'approval',
    chainId: CHAIN_ID.toString(),
    manager: MANAGER,
    digestVersion: '1',
    account: ACCOUNT,
    action: ACTION,
    attemptId: PREDICTED_ATTEMPT_ID.toString(),
    setupNonce: '3',
    setupBodyHash: `0x${'44'.repeat(32)}`,
    validUntil: VALID_UNTIL,
    place: 0,
    method: METHOD,
    config: '0xabcd',
    salt: '0x01'
  }
  const PARAMS = { relyingPartyId: 'chrome-extension://abc', userName: 'holder' }
  const target = { account: ACCOUNT, chainId: CHAIN_ID, method: 'passkey' }
  const ENROLL: CeremonyRequestRecord = {
    ...target,
    call: 'enroll',
    methodAddress: METHOD,
    params: PARAMS
  }
  const REQUESTS: CeremonyRequestRecord[] = [
    ENROLL,
    { ...target, call: 'testAccess', request: APPROVER_REQUEST, params: PARAMS },
    { ...target, call: 'createClaim', request: APPROVER_REQUEST },
    { ...target, call: 'healthCheck' }
  ]

  REQUESTS.forEach((request) =>
    it(`round-trips the ${request.call} request, which another instance over the same storage reads`, async () => {
      const { storage, records } = setup()
      await records.ceremonyRequest(ID).write(request)
      const tab = createWalletRecords({ storage, now: () => T0 + HOUR })
      const read = present(await tab.ceremonyRequest(ID).read())
      expect(read.value).toEqual(request)
      expect(read.savedAt).toBe(T0)
      expect(await tab.ceremonyRequest(ID).age()).toBe(HOUR)
    })
  )

  it('keeps a bigint chain id a bigint and a number chain id a number', async () => {
    const { records } = setup()
    await records.ceremonyRequest('as-bigint').write(ENROLL)
    await records.ceremonyRequest('as-number').write({ ...ENROLL, chainId: 11155111 })
    expect(present(await records.ceremonyRequest('as-bigint').read()).value.chainId).toBe(CHAIN_ID)
    expect(present(await records.ceremonyRequest('as-number').read()).value.chainId).toBe(11155111)
  })

  it('reads a request whose account is in a letter case that fails the checksum', async () => {
    const { records } = setup()
    await records.ceremonyRequest(ID).write({ ...ENROLL, account: MISCASED })
    expect(present(await records.ceremonyRequest(ID).read()).value.account).toBe(MISCASED)
  })

  it('reads absent under an id nothing was written under, and never the request of another id', async () => {
    const { records } = setup()
    await records.ceremonyRequest(ID).write(ENROLL)
    expect(await records.ceremonyRequest('req-2').read()).toBe(ABSENT)
    expect(await records.ceremonyRequest('req-2').age(T0)).toBeNull()
    expect(await records.ceremonyRequest('REQ-1').read()).toBe(ABSENT)
  })

  it('a later write under the same id replaces the request and restamps it', async () => {
    const { records, clock } = setup()
    await records.ceremonyRequest(ID).write(ENROLL)
    clock.t = T0 + HOUR
    await records.ceremonyRequest(ID).write(REQUESTS[1])
    const read = present(await records.ceremonyRequest(ID).read())
    expect(read.value).toEqual(REQUESTS[1])
    expect(read.savedAt).toBe(T0 + HOUR)
  })

  it('a removal leaves the request absent, and every other request and record in place', async () => {
    const { records } = setup()
    await records.ceremonyRequest(ID).write(ENROLL)
    await records.ceremonyRequest('req-2').write(REQUESTS[1])
    await records.setup(CHAIN_ID, ACCOUNT).inventory.write(['passport'])
    await records.ceremonyRequest(ID).wipe()
    expect(await records.ceremonyRequest(ID).read()).toBe(ABSENT)
    expect(present(await records.ceremonyRequest('req-2').read()).value).toEqual(REQUESTS[1])
    expect(present(await records.setup(CHAIN_ID, ACCOUNT).inventory.read()).value).toEqual([
      'passport'
    ])
    await expect(records.ceremonyRequest(ID).wipe()).resolves.toBeUndefined()
  })

  const stored = (value: unknown) => ({ value, savedAt: T0 })
  const MALFORMED: [string, unknown][] = [
    ['a bare request with no savedAt', ENROLL],
    ['a bare false', false],
    ['a bare zero', 0],
    ['a bare string', 'passkey'],
    ['a request with a savedAt that is no number', { value: ENROLL, savedAt: 'yesterday' }],
    ['a stored null', stored(null)],
    ['a stored string', stored('enroll')],
    ['a request with no account', stored({ ...ENROLL, account: undefined })],
    ['a request whose account is no address', stored({ ...ENROLL, account: '0x1234' })],
    ['a request with no chain id', stored({ ...ENROLL, chainId: undefined })],
    ['a request whose chain id is a string', stored({ ...ENROLL, chainId: '11155111' })],
    ['a request with no method', stored({ ...ENROLL, method: undefined })],
    ['a request whose method is no string', stored({ ...ENROLL, method: 7 })],
    ['a request with no call', stored({ ...ENROLL, call: undefined })],
    ['a request for a call the tab does not run', stored({ ...ENROLL, call: 'sign' })],
    ['an enrollment with no method address', stored({ ...ENROLL, methodAddress: undefined })],
    [
      'an enrollment whose method address is no address',
      stored({ ...ENROLL, methodAddress: '0x12' })
    ],
    ['a test access with no request', stored({ ...target, call: 'testAccess' })],
    ['a claim whose request is null', stored({ ...target, call: 'createClaim', request: null })],
    [
      'a test access whose request is a string',
      stored({ ...target, call: 'testAccess', request: 'r' })
    ]
  ]
  MALFORMED.forEach(([label, value]) =>
    it(`reads ${label} under the id as absent`, async () => {
      const { storage, records } = setup()
      await storage.set(recordKeys.ceremonyRequest(ID), value)
      expect(await records.ceremonyRequest(ID).read()).toBe(ABSENT)
      expect(await records.ceremonyRequest(ID).age(T0)).toBeNull()
    })
  )

  it('keys a request under any id the ceremony route carries: up to 128 letters, digits, _ and -', async () => {
    const { records } = setup()
    const longest = `A_b-9${'x'.repeat(123)}`
    expect(longest).toHaveLength(128)
    await records.ceremonyRequest(longest).write(ENROLL)
    expect(present(await records.ceremonyRequest(longest).read()).value).toEqual(ENROLL)
  })

  const BAD_IDS: [string, string][] = [
    ['an empty id', ''],
    ['an id with a slash', 'a/b'],
    ['an id with a colon', 'a:b'],
    ['an id with a space', 'a b'],
    ['an id that climbs a path', '../x'],
    ['an id with a dot', 'id.1'],
    ['an id with a letter outside ASCII', 'é'],
    ['an id of 129 characters', 'x'.repeat(129)]
  ]
  BAD_IDS.forEach(([label, bad]) =>
    it(`refuses ${label} and stores nothing`, async () => {
      const { storage, records } = setup()
      const refused = (fn: () => unknown) =>
        expect(attempt(fn)).rejects.toThrow(/Invalid request id/)
      await refused(() => records.ceremonyRequest(bad).write(ENROLL))
      await refused(() => records.ceremonyRequest(bad).read())
      await refused(() => records.ceremonyRequest(bad).wipe())
      await refused(() => records.ceremonyRequest(bad).age())
      expect(storage.raw.size).toBe(0)
      expect(storage.calls).toEqual({ set: [], remove: [], setEntries: [], removeKeys: [] })
    })
  )

  /** Whether the ceremony tab's route reads `id` from its search. */
  const routeTakes = (id: string): boolean => {
    const parsed = parseCeremonySearch(
      new URLSearchParams({ call: 'enroll', method: 'passkey', id })
    )
    return parsed.ok && parsed.params.id === id
  }

  /** Whether the records key a request under `id`. */
  const recordsTake = (id: string): boolean => {
    const { records } = setup()
    try {
      records.ceremonyRequest(id)
      return true
    } catch {
      return false
    }
  }

  it('keys a request under exactly the ids the ceremony route reads', () => {
    const printable = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i))
    const ids = [
      ...printable,
      ...printable.map((c) => `a${c}b`),
      '',
      'req-1',
      'A_b-9',
      'é',
      'a\nb',
      'a\u0000b',
      '%20',
      'x'.repeat(127),
      'x'.repeat(128),
      'x'.repeat(129),
      '-'.repeat(128),
      newCeremonyRequestId()
    ]
    const disagreements = ids.filter((id) => routeTakes(id) !== recordsTake(id))
    expect(disagreements).toEqual([])
    expect(ids.filter(routeTakes).length).toBeGreaterThan(60)
    expect(ids.filter((id) => !routeTakes(id)).length).toBeGreaterThan(60)
  })

  it('hands a caller a fresh request id of 32 hex digits, which the route reads and the records key', async () => {
    const { records } = setup()
    const id = newCeremonyRequestId()
    expect(id).toMatch(/^[0-9a-f]{32}$/)
    expect(routeTakes(id)).toBe(true)
    await records.ceremonyRequest(id).write(ENROLL)
    expect(present(await records.ceremonyRequest(id).read()).value).toEqual(ENROLL)
  })

  it('hands out another request id on each call', () => {
    const ids = Array.from({ length: 200 }, () => newCeremonyRequestId())
    expect(new Set(ids).size).toBe(ids.length)
  })
})
