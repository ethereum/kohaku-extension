/**
 * @jest-environment jsdom
 *
 * Mounts the checklist, the recovery in progress and the home band with the
 * app's own components, the real en.json and real records on an in-memory
 * double of the extension's storage helper. The fakes sit at the edge: the
 * recovery client's members answer with the gathering records the SDK
 * declares, built here from a configuration; the ceremony tab's report
 * channel; the navigation. jsdom has no `TextEncoder`, which viem reads when
 * it loads, so the harness sets Node's before it loads the modules.
 */
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import type { ReactElement } from 'react'
import { TextDecoder, TextEncoder } from 'util'
import { webcrypto } from 'crypto'

import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import type { ThemeProps } from '@common/styles/themeConfig'
import type {
  AddResult,
  Address,
  ApproverReply,
  ApproverRequest,
  Assessment,
  AttemptRequest,
  Clause,
  Configuration,
  Credential,
  Gathering,
  Hex,
  SerializedPaymentOrder
} from '@web/modules/social-recovery/sdk-interfaces'
import type {
  CeremonyCall,
  CeremonyOutcome,
  ReportStore,
  ReportSubscribe,
  VisibilitySource
} from '@web/modules/social-recovery/shared/ceremony'
import type {
  RecordStorage,
  RecoveryEntryRecord,
  RecoveryRoute,
  StoredSession,
  WalletRecords
} from '@web/modules/social-recovery/shared/records'

import type {
  ChecklistClient,
  ChecklistDeps,
  ChecklistHeadline,
  ChecklistKitClient,
  ChecklistSearch,
  DestinationReading,
  SessionHeadlineHook
} from '@web/modules/social-recovery/recovery/checklist/types'

Object.assign(globalThis, { TextEncoder, TextDecoder })
if (!globalThis.crypto?.getRandomValues) {
  Object.assign(globalThis, { crypto: webcrypto })
}
// React only runs effects and state updates inside act() when this flag is set.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The avatar loads its image files, which Jest cannot read.
jest.mock('@common/components/Avatar', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const { createElement } = require('react')
  return {
    __esModule: true,
    default: ({ pfp }: { pfp: string }) =>
      createElement('div', { 'data-testid': 'guardian-blockie', 'data-pfp': pfp })
  }
})

/**
 * What the QR double drew, every render in order, and whether it fails to
 * draw: a failing draw reports its error once mounted, as the library does
 * where a value does not fit a code.
 */
const mockQr: { drawn: string[]; fails: boolean } = { drawn: [], fails: false }

// The QR library ships untranspiled modules.
jest.mock('react-native-qrcode-svg', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const { createElement, useEffect } = require('react')
  return {
    __esModule: true,
    default: ({ value, onError }: { value: string; onError?: (error: Error) => void }) => {
      mockQr.drawn.push(value)
      const fails = mockQr.fails
      useEffect(() => {
        if (fails) {
          onError?.(new Error('the value does not fit a code'))
        }
      }, [fails, onError])
      return createElement('div', { 'data-testid': 'challenge-qr', 'data-value': value })
    }
  }
})

/** The QR double: the values it drew, and the switch that makes the next draws fail. */
export const qrDouble = mockQr

afterEach(() => {
  mockQr.drawn.length = 0
  mockQr.fails = false
})

// The clipboard module ships untranspiled modules.
jest.mock('@common/utils/clipboard', () => ({
  setStringAsync: jest.fn(async () => true)
}))

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const {
  parse,
  stringify
}: typeof import('@ambire-common/libs/richJson/richJson') = require('@ambire-common/libs/richJson/richJson')
const {
  ThemeContext
}: typeof import('@common/contexts/themeContext') = require('@common/contexts/themeContext')
const themeConfig: typeof import('@common/styles/themeConfig') = require('@common/styles/themeConfig')
const i18n: typeof import('@common/config/localization').default =
  require('@common/config/localization').default
const {
  encodeAbiParameters,
  keccak256,
  pad,
  toHex,
  zeroHash
}: typeof import('viem') = require('viem')
const {
  ceremonyReport,
  ceremonyResultKey
}: typeof import('@web/modules/social-recovery/shared/ceremony') = require('@web/modules/social-recovery/shared/ceremony')
const {
  addressBookOf,
  CHAIN_IDS,
  WALLET_RECOVERY_CHAIN
}: typeof import('@web/modules/social-recovery/shared/client') = require('@web/modules/social-recovery/shared/client')
const {
  createWalletRecords
}: typeof import('@web/modules/social-recovery/shared/records') = require('@web/modules/social-recovery/shared/records')
const ChecklistView: typeof import('@web/modules/social-recovery/recovery/checklist/ChecklistView').default =
  require('@web/modules/social-recovery/recovery/checklist/ChecklistView').default
const InProgressView: typeof import('@web/modules/social-recovery/recovery/checklist/InProgressView').default =
  require('@web/modules/social-recovery/recovery/checklist/InProgressView').default
const HomeRecoveryBandView: typeof import('@web/modules/social-recovery/recovery/checklist/HomeRecoveryBandView').default =
  require('@web/modules/social-recovery/recovery/checklist/HomeRecoveryBandView').default
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

export const CHAIN_ID = CHAIN_IDS[WALLET_RECOVERY_CHAIN]
export const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'
export const SECOND_ACCOUNT: Address = '0x5555555555555555555555555555555555555555'
export const RECEIVING: Address = '0x3333333333333333333333333333333333333333'
export const DESTINATION: Address = '0x4444444444444444444444444444444444444444'
export const REMOVED: Address = '0x6666666666666666666666666666666666666666'
export const BOOK = addressBookOf(WALLET_RECOVERY_CHAIN)
/** The fixed clock the fakes read, in ms. */
export const NOW = 1_800_000_000_000
export const NOW_SECONDS = NOW / 1000
export const DAY_SECONDS = 24 * 3600
export const TIME_ZONE = 'UTC'
/** The relying-party hash of this page, and one another origin committed. */
export const RP_HASH: Hex = keccak256(toHex('this-origin'))
export const OTHER_RP_HASH: Hex = keccak256(toHex('another-origin'))
export const PASSWORD = 'recovery password'

export const t = (key: string, values?: Record<string, unknown>): string => i18n.t(key, values)

const THEME = Object.fromEntries(
  Object.entries(themeConfig.default).map(([name, byType]) => [
    name,
    byType[themeConfig.THEME_TYPES.LIGHT]
  ])
) as ThemeProps

const THEME_CONTEXT: ThemeContextReturnType = {
  theme: THEME,
  themeType: themeConfig.THEME_TYPES.LIGHT,
  selectedThemeType: themeConfig.THEME_TYPES.LIGHT,
  setThemeType: () => {}
}

// ---------------------------------------------------------------------------
// The storage double
// ---------------------------------------------------------------------------

export interface TestStorage extends RecordStorage {
  /** Every key `set` stored, in order. */
  sets: string[]
  /** Holds every `set` of a key that holds `name` until the returned release runs. */
  hold: (name: string) => () => void
  /** Every write of a key that holds one of these names fails while listed. */
  refuse: string[]
  /** Every stored value by key, as the extension's storage holds it. */
  getAll: NonNullable<RecordStorage['getAll']>
}

/**
 * Every hold still closed. The records queue each key's updates across every
 * records object, so a hold a failed test never released would stall the
 * tests after it: each test opens what it left closed.
 */
const openHolds = new Set<() => void>()

afterEach(() => {
  openHolds.forEach((release) => release())
  openHolds.clear()
})

export const makeStorage = (): TestStorage => {
  const raw = new Map<string, string>()
  const held = new Map<string, Promise<void>>()
  const sets: string[] = []
  const refuse: string[] = []
  const refuses = (key: string) => refuse.some((name) => key.includes(name))
  const waitFor = async (key: string) => {
    const gates = [...held.entries()].filter(([name]) => key.includes(name))
    await Promise.all(gates.map(([, gate]) => gate))
  }
  const put = (key: string, value: unknown) => {
    raw.set(key, typeof value === 'string' ? value : stringify(value))
  }
  return {
    sets,
    refuse,
    hold: (name) => {
      let release = () => {}
      held.set(
        name,
        new Promise<void>((resolve) => {
          release = () => {
            held.delete(name)
            openHolds.delete(release)
            resolve()
          }
          openHolds.add(release)
        })
      )
      return () => release()
    },
    get: async (key, defaultValue) => {
      const stored = key && raw.get(key)
      return stored ? parse(stored) : defaultValue
    },
    getAll: async () =>
      Object.fromEntries([...raw.entries()].map(([key, stored]) => [key, parse(stored)])),
    set: async (key, value) => {
      await waitFor(key)
      if (refuses(key)) {
        throw new Error('storage full')
      }
      sets.push(key)
      put(key, value)
      return null
    },
    setEntries: async (entries) => {
      if (Object.keys(entries).some(refuses)) {
        throw new Error('storage full')
      }
      Object.entries(entries).forEach(([key, value]) => put(key, value))
    },
    remove: async (key) => {
      raw.delete(key)
      return null
    },
    removeKeys: async (keys) => {
      keys.forEach((key) => raw.delete(key))
    }
  }
}

export interface TestRecords {
  storage: TestStorage
  records: WalletRecords
  /** Another tab's records over the same storage. */
  otherTab: WalletRecords
}

export const testRecords = (): TestRecords => {
  const storage = makeStorage()
  return {
    storage,
    records: createWalletRecords({ storage, now: () => NOW }),
    otherTab: createWalletRecords({ storage, now: () => NOW + 1 })
  }
}

// ---------------------------------------------------------------------------
// The path
// ---------------------------------------------------------------------------

const word = (n: number): Hex => pad(toHex(n), { size: 32 })

export const passkeyCredential = (label: string, rpIdHash: Hex = RP_HASH, n = 1): Credential => ({
  method: BOOK.methods.passkey,
  config: encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }],
    [word(n), word(n + 1), rpIdHash]
  ),
  label
})

export const guardianCredential = (address: Address, label?: string): Credential => ({
  method: BOOK.methods.ecdsa,
  config: encodeAbiParameters([{ type: 'address' }], [address]),
  ...(label ? { label } : {})
})

export const passportCredential = (): Credential => ({
  method: BOOK.methods.zkpassport,
  config: word(9)
})

export const configurationOf = (clauses: Clause[]): Configuration => ({
  clauses,
  wait: 172800n,
  ignoresPause: false
})

export const GUARDIANS: Address[] = [
  '0x7000000000000000000000000000000000000001',
  '0x7000000000000000000000000000000000000002',
  '0x7000000000000000000000000000000000000003',
  '0x7000000000000000000000000000000000000004'
]

/**
 * A path of both shapes: a passkey and a guardian each required, then a group
 * of three guardians with a threshold of two. Places 0 and 1 are required,
 * places 2, 3 and 4 the group's members.
 */
export const MIXED_PATH = configurationOf([
  { threshold: 1, credentials: [passkeyCredential('Laptop passkey')] },
  { threshold: 1, credentials: [guardianCredential(GUARDIANS[0], 'Alice')] },
  {
    threshold: 2,
    credentials: [
      guardianCredential(GUARDIANS[1]),
      guardianCredential(GUARDIANS[2]),
      guardianCredential(GUARDIANS[3])
    ]
  }
])

// ---------------------------------------------------------------------------
// The gathering records
// ---------------------------------------------------------------------------

/** The gathering an init opens over a configuration; `attempt` tells two inits apart. */
export const gatheringOf = (
  configuration: Configuration,
  attempt = 1,
  account: Address = ACCOUNT
): Gathering => ({
  kind: 'gathering',
  version: 1,
  purpose: 'approval',
  request: {
    chainId: String(CHAIN_ID),
    manager: BOOK.manager,
    digestVersion: '1',
    account,
    action: BOOK.action,
    attemptId: String(attempt),
    setupNonce: '1',
    setupBody: '0x01',
    validUntil: String(NOW_SECONDS + DAY_SECONDS),
    block: { number: 100 + attempt, timestamp: String(NOW_SECONDS), hash: zeroHash }
  },
  places: configuration.clauses
    .flatMap((clause) => clause.credentials)
    .map((credential, place) => ({
      place,
      method: credential.method,
      config: credential.config,
      salt: word(1000 + place),
      ...(credential.label ? { label: credential.label } : {}),
      standing: 'not-stopped' as const,
      stoppable: false
    })),
  replies: []
})

export const requestOf = (gathering: Gathering, place: number): ApproverRequest => {
  const at = gathering.places[place]
  const r = gathering.request
  return {
    kind: 'recovery-proof-request',
    version: 1,
    purpose: gathering.purpose,
    chainId: r.chainId,
    manager: r.manager,
    digestVersion: r.digestVersion,
    account: r.account,
    action: r.action,
    attemptId: r.attemptId,
    setupNonce: r.setupNonce,
    setupBodyHash: keccak256(r.setupBody),
    validUntil: r.validUntil,
    place,
    method: at.method,
    config: at.config,
    salt: at.salt
  }
}

/** The order of the first release, no payment, as the client serialises it on a request. */
export const NO_PAYMENT: SerializedPaymentOrder = {
  token: '0x0000000000000000000000000000000000000000',
  amount: '0',
  payee: '0x0000000000000000000000000000000000000000'
}

/** The handover bytes a served request carries. */
export const HANDOVER: Hex = '0xabcdef'

/** A place's request as the client serves it: with the order and the handover bytes. */
export const servedRequestOf = (gathering: Gathering, place: number): ApproverRequest => ({
  ...requestOf(gathering, place),
  payload: HANDOVER,
  order: NO_PAYMENT
})

export const replyOf = (gathering: Gathering, place: number): ApproverReply => {
  const at = gathering.places[place]
  const r = gathering.request
  return {
    kind: 'recovery-proof-reply',
    version: 1,
    chainId: r.chainId,
    manager: r.manager,
    account: r.account,
    action: r.action,
    attemptId: r.attemptId,
    purpose: gathering.purpose,
    place,
    method: at.method,
    config: at.config,
    salt: at.salt,
    digest: word(2000 + place),
    proof: word(3000 + place)
  }
}

export const withReplies = (gathering: Gathering, places: number[]): Gathering => ({
  ...gathering,
  replies: places.map((place) => replyOf(gathering, place))
})

/** The assessment the SDK makes: every clause that asks something complete satisfies the rule. */
export const assessmentOf = (configuration: Configuration, gathering: Gathering): Assessment => {
  const replied = new Set(gathering.replies.map((reply) => reply.place))
  const all = gathering.places.map((place) => place.place)
  let next = 0
  const clauses = configuration.clauses.map((clause, index) => {
    const places = clause.credentials.map(() => {
      next += 1
      return next - 1
    })
    return {
      clause: index,
      threshold: clause.threshold,
      filled: places.filter((place) => replied.has(place)).length
    }
  })
  const asking = clauses.filter((clause) => clause.threshold > 0)
  return {
    filled: all.filter((place) => replied.has(place)),
    missing: all.filter((place) => !replied.has(place)),
    clauses,
    ruleSatisfied: asking.length > 0 && asking.every((clause) => clause.filled >= clause.threshold),
    findings: []
  }
}

// ---------------------------------------------------------------------------
// The client
// ---------------------------------------------------------------------------

export interface FakeKit {
  state: ChecklistClient
  initRecoveryGathering: jest.Mock
  getApproverRequests: jest.Mock
  addApproverReply: jest.Mock
  assess: jest.Mock
  getSetup: jest.Mock
  removedKey: jest.Mock
  recoveryState: jest.Mock
  isAuthorized: jest.Mock
  complete: jest.Mock
  verifyReply: jest.Mock
}

export interface FakeKitOptions {
  /** Requests carry the order and the handover bytes, as the client serves them. */
  served?: boolean
}

/**
 * A ready client over one configuration. Each init opens a new gathering
 * under the next attempt number; a reply the gathering does not name is
 * refused as the SDK refuses it.
 */
export const fakeKit = (configuration: Configuration, options: FakeKitOptions = {}): FakeKit => {
  let inits = 0
  const initRecoveryGathering = jest.fn(async () => {
    inits += 1
    return gatheringOf(configuration, inits)
  })
  const getApproverRequests = jest.fn((gathering: Gathering) =>
    gathering.places.map((place) =>
      (options.served ? servedRequestOf : requestOf)(gathering, place.place)
    )
  )
  const addApproverReply = jest.fn((gathering: Gathering, reply: ApproverReply): AddResult => {
    if (reply.attemptId !== gathering.request.attemptId) {
      return { gathering, reason: { kind: 'add-refusal', cause: 'binding-mismatch' } }
    }
    return {
      gathering: {
        ...gathering,
        replies: [...gathering.replies.filter((held) => held.place !== reply.place), reply]
      }
    }
  })
  const assess = jest.fn((gathering: Gathering) => assessmentOf(configuration, gathering))
  const getSetup = jest.fn(async () => configuration)
  const removedKey = jest.fn(async () => ({ kind: 'named', key: REMOVED }))
  const recoveryState = jest.fn(async () => ({
    attempt: { state: 'None', attemptId: 0n, setupNonce: 1n },
    nextAttemptId: 1n,
    setupNonce: 1n
  }))
  const isAuthorized = jest.fn(async () => true)
  // The submission builder refuses until a test scripts the set it picks.
  const complete = jest.fn((): AttemptRequest => {
    throw new Error('no submission built')
  })
  const verifyReply = jest.fn(async () => 'satisfied')
  const client = {
    recovery: {
      initRecoveryGathering,
      getApproverRequests,
      addApproverReply,
      assess,
      recoveryState,
      complete
    },
    setup: { getSetup },
    walletReads: { removedKey, verifyReply },
    action: { isAuthorized }
  } as unknown as ChecklistKitClient
  return {
    state: { status: 'ready', client },
    initRecoveryGathering,
    getApproverRequests,
    addApproverReply,
    assess,
    getSetup,
    removedKey,
    recoveryState,
    isAuthorized,
    complete,
    verifyReply
  }
}

export interface ScriptedRecoveryState {
  state?: 'None' | 'Waiting' | 'Cancelled' | 'Consumed'
  attemptId?: bigint
  nextAttemptId?: bigint
  setupNonce?: bigint
  payloadHash?: Hex
}

/**
 * The account's recovery state as the manager answers it: no attempt, the
 * first id next, setup nonce one, and the attempt's payload hash empty.
 */
export const recoveryStateOf = ({
  state = 'None',
  attemptId = BigInt(0),
  nextAttemptId = BigInt(1),
  setupNonce = BigInt(1),
  payloadHash = zeroHash
}: ScriptedRecoveryState = {}) => ({
  attempt: { state, attemptId, setupNonce, payloadHash },
  nextAttemptId,
  setupNonce
})

/** The refusal an init throws where the configuration is not the one the chain commits. */
export const commitmentMismatch = (): Error =>
  Object.assign(new Error('The configuration does not match the setup commitment'), {
    cause: { code: 'restore.commitment-mismatch', subject: 'setup', severity: 'error' }
  })

// ---------------------------------------------------------------------------
// The records a test starts from
// ---------------------------------------------------------------------------

export const entryOf = (route: RecoveryRoute = 'logged-in'): RecoveryEntryRecord => ({
  account: ACCOUNT,
  route,
  receivingAccount: RECEIVING
})

export const seedEntry = async (
  records: WalletRecords,
  entry: RecoveryEntryRecord = entryOf(),
  account: Address = ACCOUNT
) => {
  await records.recoveryEntry(CHAIN_ID, account).write({ ...entry, account })
}

export const seedCache = async (
  records: WalletRecords,
  configuration: Configuration,
  account: Address = ACCOUNT
) => {
  await records.decryptedSetupCache(CHAIN_ID, account).write({ configuration, setupNonce: 1n })
}

export const seedSession = async (
  records: WalletRecords,
  gathering: Gathering,
  account: Address = ACCOUNT
): Promise<StoredSession> => records.recoverySession(CHAIN_ID, account).write(gathering, null)

export const storedSession = async (
  records: WalletRecords,
  account: Address = ACCOUNT
): Promise<StoredSession | null> => {
  const read = await records.recoverySession(CHAIN_ID, account).read()
  return read.status === 'present' ? read : null
}

// ---------------------------------------------------------------------------
// The ceremony tab's report channel
// ---------------------------------------------------------------------------

export interface ReportChannel {
  store: ReportStore
  subscribe: ReportSubscribe
  /**
   * Writes the report the tab writes for the ceremony `id` at `at` (ms, the
   * fixed clock by default), and tells the listeners.
   */
  report: (
    id: string,
    call: CeremonyCall,
    outcome: CeremonyOutcome<unknown>,
    at?: number
  ) => Promise<void>
}

export const reportChannel = (): ReportChannel => {
  const values = new Map<string, unknown>()
  const listeners = new Map<string, Set<(value: unknown) => void>>()
  const store: ReportStore = {
    get: async (key, defaultValue) => (values.has(key) ? values.get(key) : defaultValue),
    set: async (key: string, value: unknown) => {
      values.set(key, value)
      return null
    },
    remove: async (key: string) => {
      values.delete(key)
      return null
    }
  } as ReportStore
  const subscribe: ReportSubscribe = (key, onValue) => {
    const set = listeners.get(key) ?? new Set()
    set.add(onValue)
    listeners.set(key, set)
    return () => set.delete(onValue)
  }
  return {
    store,
    subscribe,
    report: async (id, call, outcome, at = NOW) => {
      const key = ceremonyResultKey(id)
      const value = ceremonyReport({ id, call, method: 'passkey' }, outcome, at)
      values.set(key, value)
      listeners.get(key)?.forEach((listener) => listener(value))
    }
  }
}

// ---------------------------------------------------------------------------
// The page's helpers
// ---------------------------------------------------------------------------

export interface FakeDeps extends ChecklistDeps {
  channel: ReportChannel
  requestIds: string[]
}

export const depsOf = (overrides: Partial<ChecklistDeps> = {}): FakeDeps => {
  const channel = reportChannel()
  const requestIds: string[] = []
  return {
    reportStore: channel.store,
    reportSubscribe: channel.subscribe,
    newRequestId: () => {
      const id = `request-${requestIds.length + 1}`
      requestIds.push(id)
      return id
    },
    now: () => NOW,
    timeZone: TIME_ZONE,
    rpIdHash: RP_HASH,
    passkeysServed: true,
    readPassword: () => undefined,
    forgetPassword: () => undefined,
    storedEntries: async () => ({}),
    ...overrides,
    channel,
    requestIds
  }
}

export interface FakeVisibility extends VisibilitySource {
  visibilityState: string
  /** Hides or shows the tab and tells the listeners, as the page does. */
  turn: (state: 'visible' | 'hidden') => void
}

/** The page's document as the checklist reads it: whether it is shown, and its change event. */
export const visibilitySource = (): FakeVisibility => {
  const listeners = new Set<() => void>()
  const source: FakeVisibility = {
    visibilityState: 'visible',
    addEventListener: (_type, listener) => {
      listeners.add(listener)
    },
    removeEventListener: (_type, listener) => {
      listeners.delete(listener)
    },
    turn: (state) => {
      source.visibilityState = state
      listeners.forEach((listener) => listener())
    }
  }
  return source
}

// ---------------------------------------------------------------------------
// The mount
// ---------------------------------------------------------------------------

export interface Mounted {
  navigate: jest.Mock
  unmount: () => void
  byTestId: (id: string) => HTMLElement | null
  text: () => string
  press: (id: string) => Promise<void>
  isDisabled: (id: string) => boolean
  /** Types into the text field at `id`, or the one inside it. */
  type: (id: string, value: string) => Promise<void>
  /** What the text field at `id`, or the one inside it, holds. */
  valueOf: (id: string) => string | undefined
  /** The path of the last navigation. */
  lastPath: () => string | undefined
}

export interface AsyncFakeTimers {
  advanceTimersByTimeAsync(ms: number): Promise<void>
}

/** Whether Jest's fake clock drives the timers: its timer functions carry their clock. */
const timersFaked = (): boolean => 'clock' in setTimeout

/**
 * Lets the pending storage reads and writes settle, then renders what they
 * changed. The fakes answer in microtasks, which all run before a timer fires.
 * Under Jest's fake clock it advances that clock by `ms` instead, running the
 * promises each timer settles before the next one.
 */
export const settle = (ms = 0) =>
  act(async () => {
    if (timersFaked()) {
      await (jest as unknown as AsyncFakeTimers).advanceTimersByTimeAsync(ms)
      return
    }
    await new Promise((resolve) => {
      setTimeout(resolve, ms)
    })
  })

/** Runs a change from outside the view, such as a report the tab writes later, and renders it. */
export const outside = (change: () => Promise<unknown>) =>
  act(async () => {
    await change()
  })

/** Mounts any element under the app's theme. */
export const mount = async (element: (navigate: jest.Mock) => ReactElement): Promise<Mounted> => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  const navigate = jest.fn()
  const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)
  const inputOf = (id: string) => {
    const node = byTestId(id)
    return node instanceof HTMLInputElement ? node : node?.querySelector('input') ?? null
  }

  await act(async () => {
    root.render(
      <ThemeContext.Provider value={THEME_CONTEXT}>{element(navigate)}</ThemeContext.Provider>
    )
  })
  await settle()

  return {
    navigate,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
    byTestId,
    text: () => container.textContent ?? '',
    press: async (id) => {
      const node = byTestId(id)
      if (!node) {
        throw new Error(`nothing to press: ${id}`)
      }
      act(() => node.click())
      await settle()
    },
    isDisabled: (id) => byTestId(id)?.getAttribute('aria-disabled') === 'true',
    type: async (id, value) => {
      const input = inputOf(id)
      if (!input) {
        throw new Error(`nothing to type into: ${id}`)
      }
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      await act(async () => {
        setValue?.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
    },
    valueOf: (id) => inputOf(id)?.value,
    lastPath: () => {
      const { calls } = navigate.mock
      return calls[calls.length - 1]?.[0]
    }
  }
}

export const mountChecklist = (input: {
  records: WalletRecords
  client: ChecklistClient
  deps: ChecklistDeps
  entry?: RecoveryEntryRecord
  search?: ChecklistSearch
  destination?: DestinationReading
}): Promise<Mounted> =>
  mount((navigate) => (
    <ChecklistView
      records={input.records}
      chainId={CHAIN_ID}
      account={ACCOUNT}
      entry={input.entry ?? entryOf()}
      client={input.client}
      destination={input.destination ?? { status: 'ready', key: DESTINATION }}
      search={input.search ?? { account: ACCOUNT }}
      navigate={navigate}
      deps={input.deps}
    />
  ))

export interface SwappableChecklist extends Mounted {
  /** Hands the mounted checklist another client, as a rebuild of the kit does. */
  swapClient: (client: ChecklistClient) => Promise<void>
}

/** The checklist with a client the test replaces while it stays mounted. */
export const mountSwappableChecklist = async (input: {
  records: WalletRecords
  client: ChecklistClient
  deps: ChecklistDeps
}): Promise<SwappableChecklist> => {
  let setClient: (client: ChecklistClient) => void = () => {}
  const Host = ({ navigate }: { navigate: jest.Mock }) => {
    const [client, set] = React.useState(input.client)
    setClient = set
    return (
      <ChecklistView
        records={input.records}
        chainId={CHAIN_ID}
        account={ACCOUNT}
        entry={entryOf()}
        client={client}
        destination={{ status: 'ready', key: DESTINATION }}
        search={{ account: ACCOUNT }}
        navigate={navigate}
        deps={input.deps}
      />
    )
  }
  const mounted = await mount((navigate) => <Host navigate={navigate} />)
  return {
    ...mounted,
    swapClient: async (client) => {
      await act(async () => {
        setClient(client)
      })
      await settle()
    }
  }
}

/** A headline hook that answers the same count for every listed session. */
export const headlineHook =
  (headline: ChecklistHeadline | null): SessionHeadlineHook =>
  () =>
    headline

export const mountInProgress = (input: {
  records: WalletRecords
  holdsPath?: (account: Address) => Promise<boolean>
  headline?: ChecklistHeadline | null
  onRoute?: (route: RecoveryRoute) => void
}): Promise<Mounted> =>
  mount((navigate) => (
    <InProgressView
      onRoute={input.onRoute}
      records={input.records}
      chainId={CHAIN_ID}
      navigate={navigate}
      timeZone={TIME_ZONE}
      holdsPath={input.holdsPath ?? (async () => true)}
      useHeadline={headlineHook(
        input.headline === undefined ? { done: 1, total: 3 } : input.headline
      )}
    />
  ))

export const mountBand = (input: {
  records: WalletRecords
  headline?: ChecklistHeadline | null
}): Promise<Mounted> =>
  mount((navigate) => (
    <HomeRecoveryBandView
      records={input.records}
      chainId={CHAIN_ID}
      navigate={navigate}
      timeZone={TIME_ZONE}
      useHeadline={headlineHook(
        input.headline === undefined ? { done: 1, total: 3 } : input.headline
      )}
    />
  ))

/** Runs a check over each case, the case's name in the title in place of `%s`. */
export const each =
  <C extends readonly unknown[]>(cases: readonly C[]) =>
  (title: string, run: (args: C) => Promise<void> | void) =>
    cases.forEach((args) => it(title.replace('%s', String(args[0])), () => run(args)))

// Registered only when Jest runs this file itself: a suite that imports the
// harness does not run its checks again.
const runningHarnessItself = expect.getState().testPath === __filename

const describeHarness = runningHarnessItself ? describe : () => undefined

describeHarness('the checklist harness', () => {
  it('assesses a group as complete once its threshold of members replied', () => {
    const gathering = withReplies(gatheringOf(MIXED_PATH), [0, 1, 2, 3])
    const assessment = assessmentOf(MIXED_PATH, gathering)
    expect(assessment.clauses).toEqual([
      { clause: 0, threshold: 1, filled: 1 },
      { clause: 1, threshold: 1, filled: 1 },
      { clause: 2, threshold: 2, filled: 2 }
    ])
    expect(assessment.ruleSatisfied).toBe(true)
    expect(assessment.missing).toEqual([4])
  })

  it('holds a write until it is released', async () => {
    const storage = makeStorage()
    const release = storage.hold('k')
    let done = false
    const write = storage.set('k', 1).then(() => {
      done = true
    })
    await Promise.resolve()
    expect(done).toBe(false)
    release()
    await write
    expect(await storage.get('k', undefined)).toBe(1)
  })
})
