/**
 * @jest-environment jsdom
 *
 * Mounts the enroll view with the app's own components, the real en.json and
 * real records on an in-memory double of the extension's storage helper. The
 * view's page helpers are fakes: the ceremony tab's report store and its
 * subscription, the recovery client, the chain reads, the keystore's keys and
 * the request queue's signer. jsdom has no `TextEncoder`, which viem reads when
 * it loads, so the harness sets Node's before it loads the modules.
 */
import { randomBytes as nodeRandomBytes } from 'crypto'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { TextDecoder, TextEncoder } from 'util'

import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import type { ThemeProps } from '@common/styles/themeConfig'
import type {
  Address,
  ApproverRequest,
  Clause,
  Hex,
  IRecoveryMethod,
  Params,
  SetupDraft
} from '@kohaku-eth/social-recovery'
import type {
  CeremonyCall,
  CeremonyOutcome,
  PasskeyFacts,
  ReportStore,
  ReportSubscribe
} from '@web/modules/social-recovery/shared/ceremony'
import type {
  CeremonyRequestRecord,
  Enrollment,
  RecordStorage,
  WalletRecords
} from '@web/modules/social-recovery/shared/records'

import type {
  EnrollClient,
  EnrollDeps,
  EnrollSearch,
  HeldKey,
  NameReaderFactory
} from '@web/modules/social-recovery/setup/enroll/types'

Object.assign(globalThis, { TextEncoder, TextDecoder })
// React only runs effects and state updates inside act() when this flag is set.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The avatar loads its image files, which Jest cannot read; the blockie is
// drawn as a node that carries the address it was drawn for.
jest.mock('@common/components/Avatar', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const { createElement } = require('react')
  return {
    __esModule: true,
    default: ({ pfp }: { pfp: string }) =>
      createElement('div', { 'data-testid': 'guardian-blockie', 'data-pfp': pfp })
  }
})

// The QR library ships untranspiled modules; the code is drawn as a node that
// carries the text it encodes.
jest.mock('react-native-qrcode-svg', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const { createElement } = require('react')
  return {
    __esModule: true,
    default: ({ value }: { value: string }) =>
      createElement('div', { 'data-testid': 'challenge-qr', 'data-value': value })
  }
})

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const { View }: typeof import('react-native') = require('react-native')
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
const { encodeAbiParameters }: typeof import('viem') = require('viem')
const {
  MethodsOrchestrator,
  passkeyMethod,
  walletMethod
}: typeof import('@kohaku-eth/social-recovery') = require('@kohaku-eth/social-recovery')
const {
  anonAadhaarMethod,
  zkPassportMethod
}: typeof import('@kohaku-eth/social-recovery/recovery-methods') = require('@kohaku-eth/social-recovery/recovery-methods')
const {
  ceremonyReport,
  ceremonyResultKey,
  readCeremonyReport
}: typeof import('@web/modules/social-recovery/shared/ceremony') = require('@web/modules/social-recovery/shared/ceremony')
const {
  addressBookOf,
  deploymentDescriptor,
  WALLET_RECOVERY_CHAIN
}: typeof import('@web/modules/social-recovery/shared/client') = require('@web/modules/social-recovery/shared/client')
const {
  methodParamsOf,
  STAND_IN_IDENTITY_PARAMS
}: typeof import('@web/modules/social-recovery/shared/client/identity-params') = require('@web/modules/social-recovery/shared/client/identity-params')
const {
  createScriptedAadhaarStack,
  createScriptedZkPassportStack
}: typeof import('@web/modules/social-recovery/shared/client/scripted') = require('@web/modules/social-recovery/shared/client/scripted')
const {
  createWalletRecords,
  emptySlot
}: typeof import('@web/modules/social-recovery/shared/records') = require('@web/modules/social-recovery/shared/records')
const EnrollView: typeof import('@web/modules/social-recovery/setup/enroll/EnrollView').default =
  require('@web/modules/social-recovery/setup/enroll/EnrollView').default
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

export const CHAIN_ID = 11155111
export const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'
export const BOOK = addressBookOf(WALLET_RECOVERY_CHAIN)
export const DESCRIPTOR = deploymentDescriptor(WALLET_RECOVERY_CHAIN)
/** The fixed clock the fakes read: the report channel and the test request's window. */
export const NOW = 1_800_000_000_000

export const t = (key: string, values?: Record<string, unknown>): string => i18n.t(key, values)

/** The light theme the view is mounted in. */
export const THEME = Object.fromEntries(
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
// Records
// ---------------------------------------------------------------------------

/** A stored request that carries an approver request, as the access test stores it. */
export type TestRecord = Extract<CeremonyRequestRecord, { request: ApproverRequest }>

export interface StorageFaults {
  get?: boolean
  /** Every write of a key that holds one of these names fails while listed. */
  refuse?: string[]
}

export const makeStorage = (faults: StorageFaults = {}): RecordStorage => {
  const raw = new Map<string, string>()
  const refuses = (key: string) => (faults.refuse ?? []).some((name) => key.includes(name))
  const put = (key: string, value: unknown) => {
    raw.set(key, typeof value === 'string' ? value : stringify(value))
  }
  return {
    get: async (key, defaultValue) => {
      if (faults.get) {
        throw new Error('storage unavailable')
      }
      const stored = key && raw.get(key)
      return stored ? parse(stored) : defaultValue
    },
    getAll: async () =>
      Object.fromEntries([...raw.entries()].map(([key, stored]) => [key, parse(stored)])),
    set: async (key, value) => {
      if (refuses(key)) {
        throw new Error('storage full')
      }
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

export const draftOf = (clauses: Clause[]): SetupDraft => ({
  wait: 172800,
  clauses,
  ignoresPause: false,
  privacy: { backup: 'encrypted', publicMetadata: '0x' }
})

/** A path of one clause: an enrolled passkey, then the given slots. */
export const pathWith = (...slots: Clause['credentials']): Clause[] => [
  { threshold: 1, credentials: slots }
]

export const recordsWith = async (
  clauses: Clause[],
  enrollments: Enrollment[] = [],
  faults: StorageFaults = {}
): Promise<{ records: WalletRecords; faults: StorageFaults; storage: RecordStorage }> => {
  const storage = makeStorage(faults)
  const records = createWalletRecords({ storage })
  const setup = records.setup(CHAIN_ID, ACCOUNT)
  await setup.writeDraftAndPath(draftOf(clauses))
  if (enrollments.length > 0) {
    await setup.enrollments.write(enrollments)
  }
  return { records, faults, storage }
}

export const storedClauses = async (records: WalletRecords): Promise<readonly Clause[]> => {
  const read = await records.setup(CHAIN_ID, ACCOUNT).setupDraft.read()
  if (read.status !== 'present') {
    throw new Error('no draft stored')
  }
  return read.value.clauses
}

export const storedEnrollments = async (records: WalletRecords): Promise<Enrollment[]> => {
  const read = await records.setup(CHAIN_ID, ACCOUNT).enrollments.read()
  return read.status === 'present' ? read.value : []
}

export { emptySlot }

// ---------------------------------------------------------------------------
// The ceremony tab's report channel
// ---------------------------------------------------------------------------

export interface ReportChannel {
  store: ReportStore
  subscribe: ReportSubscribe
  /**
   * Writes the report the tab writes for the ceremony `id` of the method
   * `method` (the passkey's unless given), and tells the listeners.
   */
  report: (
    id: string,
    call: CeremonyCall,
    outcome: CeremonyOutcome<unknown>,
    method?: string
  ) => Promise<void>
  has: (id: string) => boolean
  listeners: () => number
  takes: jest.Mock
}

export const reportChannel = (): ReportChannel => {
  const values = new Map<string, unknown>()
  const listeners = new Map<string, Set<(value: unknown) => void>>()
  const takes = jest.fn()
  const store: ReportStore = {
    get: async (key, defaultValue) => (values.has(key) ? values.get(key) : defaultValue),
    set: async (key: string, value: unknown) => {
      values.set(key, value)
      return null
    },
    remove: async (key: string) => {
      if (values.has(key)) {
        takes(key)
      }
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
    report: async (id, call, outcome, method = 'passkey') => {
      const key = ceremonyResultKey(id)
      const value = ceremonyReport({ id, call, method }, outcome, NOW)
      values.set(key, value)
      listeners.get(key)?.forEach((listener) => listener(value))
    },
    has: (id) => values.has(ceremonyResultKey(id)),
    listeners: () => [...listeners.values()].reduce((n, set) => n + set.size, 0),
    takes
  }
}

// ---------------------------------------------------------------------------
// Passkey facts
// ---------------------------------------------------------------------------

export const SYNCED_ON_GOOGLE: PasskeyFacts = {
  kind: 'synced',
  backedUp: true,
  place: 'this-device',
  attachment: 'platform',
  transports: ['internal', 'hybrid'],
  aaguid: 'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4'
}

export const BOUND_TO_THIS_MAC: PasskeyFacts = {
  kind: 'device-bound',
  backedUp: false,
  place: 'this-device',
  attachment: 'platform',
  transports: ['internal']
}

// ---------------------------------------------------------------------------
// The client
// ---------------------------------------------------------------------------

export const guardianConfigOf = (address: Address): Hex =>
  encodeAbiParameters([{ type: 'address' }], [address])

export interface FakeClient {
  state: EnrollClient
  signingInputs: ApproverRequest[]
  enrollParams: unknown[]
}

export interface ReadyClientOptions {
  /** The params the client gives a method for a call; the stand-in chain's by default. */
  methodParamsFor?: (slug: string, call: CeremonyCall) => Params | undefined
  /** The method the client serves under a slug; the shipped and identity methods by default. */
  methodFor?: (slug: string) => IRecoveryMethod | undefined
}

/** The params of the stand-in chain, which every device of the chain shares. */
export const standInParamsFor = (slug: string, call: CeremonyCall): Params | undefined =>
  methodParamsOf(STAND_IN_IDENTITY_PARAMS, slug, call)

/**
 * A ready client over the SDK's orchestrator with the shipped methods and the
 * two identity methods over their scripted stacks, each serving the modules
 * the descriptor names for it. It records every enrollment's params and every
 * request it is asked to build signing input for.
 */
export const readyClient = (options: ReadyClientOptions = {}): FakeClient => {
  const signingInputs: ApproverRequest[] = []
  const enrollParams: unknown[] = []
  const ecdsa = walletMethod()
  const zkPassport = zkPassportMethod({ stack: createScriptedZkPassportStack() })
  const aadhaar = anonAadhaarMethod({ stack: createScriptedAadhaarStack() })
  const bySlug = new Map<string, IRecoveryMethod>([
    ['ecdsa', ecdsa],
    ['zkpassport', zkPassport],
    ['aadhaar', aadhaar]
  ])
  const methods: IRecoveryMethod[] = [ecdsa, passkeyMethod(), zkPassport, aadhaar]
  const approving = new MethodsOrchestrator(
    new Map(
      methods.flatMap((method) =>
        method.modules(DESCRIPTOR).map((module) => [module, method] as const)
      )
    ),
    new Map(),
    methods.map((method) => method.deviceBinding)
  )
  const { enrollInput, signingInput } = approving
  jest.spyOn(approving, 'enrollInput').mockImplementation((method, params) => {
    enrollParams.push(params)
    return enrollInput.call(approving, method, params)
  })
  jest.spyOn(approving, 'signingInput').mockImplementation((request, params) => {
    signingInputs.push(request)
    return signingInput.call(approving, request, params)
  })
  return {
    state: {
      status: 'ready',
      client: {
        approving,
        methodFor: options.methodFor ?? ((slug: string) => bySlug.get(slug)),
        methodParamsFor: options.methodParamsFor ?? standInParamsFor,
        descriptor: DESCRIPTOR
      }
    },
    signingInputs,
    enrollParams
  }
}

// ---------------------------------------------------------------------------
// The mainnet name readers
// ---------------------------------------------------------------------------

/**
 * One endpoint's answer: an address, null for no address, a throw, an answer
 * that arrives after a delay, or `'never'` for an endpoint that never answers.
 */
export type FakeNameAnswer =
  | string
  | null
  | Error
  | 'never'
  | { afterMs: number; address: string | null }

/** A reader factory with no network, and what each endpoint's reader was asked. */
export interface FakeNameReaders {
  readerOf: NameReaderFactory
  /** Every endpoint a reader was built on, in order. */
  urls: string[]
  /** Every name a reader was asked to resolve, in order. */
  names: string[]
  /** Every endpoint whose reader was destroyed, in order. */
  destroyed: string[]
}

/** A name read in progress: whether it has settled and the address it gave. */
export interface NameReadOutcome {
  settled: boolean
  address?: string
}

/** Jest's fake clock as its runtime offers it, beyond the typings this repository carries. */
export interface AsyncFakeTimers {
  advanceTimersByTimeAsync(ms: number): Promise<void>
}

// ---------------------------------------------------------------------------
// The page's helpers
// ---------------------------------------------------------------------------

export interface FakeDeps extends EnrollDeps {
  channel: ReportChannel
  requestIds: string[]
  /** Every random value the view drew, as hex, in order. */
  salts: Hex[]
}

export const depsOf = (overrides: Partial<EnrollDeps> = {}): FakeDeps => {
  const channel = reportChannel()
  const requestIds: string[] = []
  const salts: Hex[] = []
  let next = 0
  return {
    passkeysServed: true,
    platform: 'mac',
    reportStore: channel.store,
    reportSubscribe: channel.subscribe,
    newRequestId: () => {
      next += 1
      const id = `request-${next}`
      requestIds.push(id)
      return id
    },
    now: () => NOW,
    randomBytes: (length: number) => {
      const bytes = nodeRandomBytes(length)
      salts.push(`0x${bytes.toString('hex')}`)
      return new Uint8Array(bytes)
    },
    resolveName: async () => '',
    chain: { readCode: async () => '0x', isValidSignature: async () => false },
    keys: [] as HeldKey[],
    ownSeedIds: [] as string[],
    signTypedData: async () => {
      throw new Error('no key signs here')
    },
    readClipboard: null,
    saveFile: () => {},
    ...overrides,
    channel,
    requestIds,
    salts
  }
}

/**
 * Holds every read of the report store until the returned release is called,
 * so a row can leave the page while its read is pending.
 */
export const holdReportReads = (deps: FakeDeps): (() => void) => {
  let release: () => void = () => undefined
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const store = deps.reportStore
  const { get } = store
  store.get = async (key, defaultValue) => {
    await held
    return get(key, defaultValue)
  }
  return () => release()
}

// ---------------------------------------------------------------------------
// The mount
// ---------------------------------------------------------------------------

/** The border colours drawn around a text field, as the page renders them. */
export interface FieldBorders {
  /** The field's own border. */
  inner: string
  /** The ring around the field's border. */
  outer: string
}

export interface Mounted {
  navigate: jest.Mock
  unmount: () => void
  byTestId: (id: string) => HTMLElement | null
  allText: (id: string) => string[]
  inputOf: (id: string) => HTMLInputElement | null
  text: () => string
  press: (id: string) => Promise<void>
  pressText: (label: string) => Promise<void>
  type: (id: string, value: string) => Promise<void>
  isDisabled: (id: string) => boolean
  settle: (ms?: number) => Promise<void>
  focus: (id: string) => void
  blur: (id: string) => void
  bordersOf: (id: string) => FieldBorders
}

/**
 * Lets the pending storage reads and writes settle, then renders what they
 * changed. The fakes answer in microtasks, which all run before a timer fires.
 */
export const settle = (ms = 0) =>
  act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, ms)
    })
  })

/** Runs a change from outside the view, such as a report the tab writes later, and renders it. */
export const outside = (change: () => Promise<unknown>) =>
  act(async () => {
    await change()
  })

export const mountView = async (input: {
  records: WalletRecords
  search: EnrollSearch | null
  client?: EnrollClient
  deps: EnrollDeps
  navigate?: jest.Mock
}): Promise<Mounted> => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  const navigate = input.navigate ?? jest.fn()

  const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)
  const inputOf = (id: string) => {
    const node = byTestId(id)
    if (!node) {
      return null
    }
    return node instanceof HTMLInputElement ? node : node.querySelector('input')
  }

  await act(async () => {
    root.render(
      <ThemeContext.Provider value={THEME_CONTEXT}>
        <EnrollView
          records={input.records}
          chainId={CHAIN_ID}
          account={ACCOUNT}
          navigate={navigate}
          search={input.search}
          client={input.client ?? readyClient().state}
          deps={input.deps}
        />
      </ThemeContext.Provider>
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
    allText: (id) =>
      Array.from(
        container.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`),
        (node) => node.textContent ?? ''
      ),
    inputOf,
    text: () => container.textContent ?? '',
    press: async (id) => {
      const node = byTestId(id)
      if (!node) {
        throw new Error(`nothing to press: ${id}`)
      }
      act(() => node.click())
      await settle()
    },
    pressText: async (label) => {
      // The innermost element that reads the label; the click bubbles to its control.
      const node = Array.from(container.querySelectorAll<HTMLElement>('*'))
        .filter((candidate) => candidate.textContent === label)
        .pop()
      if (!node) {
        throw new Error(`nothing to press: ${label}`)
      }
      act(() => node.click())
      await settle()
    },
    type: async (id, value) => {
      const field = inputOf(id)
      if (!field) {
        throw new Error(`nothing to type into: ${id}`)
      }
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      act(() => {
        setValue?.call(field, value)
        field.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await settle()
    },
    isDisabled: (id) => byTestId(id)?.getAttribute('aria-disabled') === 'true',
    settle,
    focus: (id) => {
      const field = inputOf(id)
      if (!field) {
        throw new Error(`nothing to focus: ${id}`)
      }
      act(() => field.focus())
    },
    blur: (id) => {
      const field = inputOf(id)
      if (!field) {
        throw new Error(`nothing to blur: ${id}`)
      }
      act(() => field.blur())
    },
    bordersOf: (id) => {
      // The wallet's input wraps the native field in its border, and that border in a ring.
      const inner = inputOf(id)?.parentElement?.parentElement
      const outer = inner?.parentElement
      if (!inner || !outer) {
        throw new Error(`no field borders: ${id}`)
      }
      return { inner: inner.style.borderTopColor, outer: outer.style.borderTopColor }
    }
  }
}

/** A colour as the page writes it into an element's style. */
export const asRendered = (colour: string): string => {
  const container = document.createElement('div')
  const root = createRoot(container)
  act(() => root.render(<View style={{ borderTopColor: colour }} />))
  const rendered = (container.firstElementChild as HTMLElement | null)?.style.borderTopColor ?? ''
  act(() => root.unmount())
  return rendered
}

/**
 * One test per case, the first member of the case named in place of `%s`.
 * Each case keeps its own member types.
 */
export const each =
  <C extends readonly unknown[]>(cases: readonly C[]) =>
  (title: string, run: (args: C) => Promise<void> | void) =>
    cases.forEach((args) => it(title.replace('%s', String(args[0])), () => run(args)))

// Registered only when Jest runs this file itself: a suite that imports the
// harness does not run its checks again.
const runningHarnessItself = expect.getState().testPath === __filename

const describeHarness = runningHarnessItself ? describe : () => undefined

describeHarness('the enroll view harness', () => {
  it('delivers a written report to a listener of its key and drops it once removed', async () => {
    const channel = reportChannel()
    const heard: unknown[] = []
    const stop = channel.subscribe(ceremonyResultKey('a'), (value) => heard.push(value))
    await channel.report('a', 'enroll', { kind: 'dismissed', note: 'cancelled' })
    expect(heard).toHaveLength(1)
    expect(channel.has('a')).toBe(true)
    await channel.store.remove(ceremonyResultKey('a'))
    expect(channel.has('a')).toBe(false)
    stop()
    expect(channel.listeners()).toBe(0)
  })

  it('writes a report under the method it is given, which only that method takes', async () => {
    const channel = reportChannel()
    await channel.report('a', 'enroll', { kind: 'dismissed', note: 'cancelled' }, 'zkpassport')
    const asPasskey = { id: 'a', call: 'enroll' as const, method: 'passkey' }
    expect(await readCeremonyReport(asPasskey, channel.store, NOW)).toBeNull()
    const taken = await readCeremonyReport(
      { ...asPasskey, method: 'zkpassport' },
      channel.store,
      NOW
    )
    expect(taken?.outcome).toEqual({ kind: 'dismissed', note: 'cancelled' })
  })

  it('serves both identity methods by their slugs, for the modules the book names', async () => {
    const { client } = readyClient().state as Extract<EnrollClient, { status: 'ready' }>
    ;(['zkpassport', 'aadhaar'] as const).forEach((slug) => {
      const method = client.methodFor(slug)
      expect(method?.modules(DESCRIPTOR).map((m) => m.toLowerCase())).toContain(
        BOOK.methods[slug].toLowerCase()
      )
      expect(client.methodParamsFor(slug, 'enroll')).toBeDefined()
    })
    const none = readyClient({ methodParamsFor: () => undefined }).state as Extract<
      EnrollClient,
      { status: 'ready' }
    >
    expect(none.client.methodParamsFor('zkpassport', 'enroll')).toBeUndefined()
  })

  it('stores a path with an empty slot and reads it back', async () => {
    const { records } = await recordsWith(pathWith(emptySlot('passkey')))
    expect(await storedClauses(records)).toEqual(pathWith(emptySlot('passkey')))
  })
})
