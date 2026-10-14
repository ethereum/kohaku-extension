/**
 * @jest-environment jsdom
 *
 * Mounts the approval page with the app's own components and the real
 * en.json. The edges are fakes: the router's search, the window's hash, the
 * wallet's networks, and the recovery client the page builds for the
 * request's account, whose description and chain reads each test scripts.
 * The logo is a stub. jsdom has no `TextEncoder`, which viem reads when it
 * loads, so the harness sets Node's before it loads the modules.
 */
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { TextDecoder, TextEncoder } from 'util'

import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import type { ThemeProps } from '@common/styles/themeConfig'
import type {
  Address,
  ApproverRequest,
  Attempt,
  Hex,
  RecoveryState,
  RequestDescription
} from '@web/modules/social-recovery/sdk-interfaces'
import type { RecoveryClientState } from '@web/modules/social-recovery/shared/client/useRecoveryClient'

Object.assign(globalThis, { TextEncoder, TextDecoder })
// React only runs effects and state updates inside act() when this flag is set.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// ---------------------------------------------------------------------------
// Test-only types
// ---------------------------------------------------------------------------

/** The client state the page's hook hands back, with its retry. */
export type ClientState = RecoveryClientState & { retry: () => void }

/** The request account's scripted client: its description and its two chain reads. */
export interface KitScript {
  describeRequest: jest.Mock<RequestDescription, [ApproverRequest]>
  recoveryState: jest.Mock<Promise<RecoveryState>, []>
  isAuthorized: jest.Mock<Promise<boolean>, []>
}

export interface Mounted {
  unmount: () => void
  has: (id: string) => boolean
  textOf: (id: string) => string
  text: () => string
  press: (id: string) => Promise<void>
  isDisabled: (id: string) => boolean
}

// ---------------------------------------------------------------------------
// The edges
// ---------------------------------------------------------------------------

const mockLocation: {
  current: { pathname: string; search: string }
  listeners: Set<() => void>
} = { current: { pathname: '/social-recovery/approve', search: '' }, listeners: new Set() }
const mockClient: {
  state: ClientState | null
  accounts: (string | undefined)[]
  listeners: Set<() => void>
} = { state: null, accounts: [], listeners: new Set() }
const mockLoading: ClientState = { status: 'loading', retry: () => {} }

jest.mock('@web/modules/social-recovery/shared/client/useRecoveryClient', () => ({
  useRecoveryClient: (account: string | undefined) => {
    mockClient.accounts.push(account)
    // eslint-disable-next-line global-require
    return require('react').useSyncExternalStore(
      (listener: () => void) => {
        mockClient.listeners.add(listener)
        return () => mockClient.listeners.delete(listener)
      },
      () => (account ? mockClient.state ?? mockLoading : mockLoading)
    )
  }
}))
jest.mock('@web/hooks/useNetworksControllerState', () => ({
  __esModule: true,
  default: () => ({ networks: [] })
}))
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  // The router renders the same page again when the link in the tab changes.
  useLocation: () =>
    // eslint-disable-next-line global-require
    require('react').useSyncExternalStore(
      (listener: () => void) => {
        mockLocation.listeners.add(listener)
        return () => mockLocation.listeners.delete(listener)
      },
      () => mockLocation.current
    )
}))
jest.mock('@common/components/AmbireLogoHorizontal', () => ({
  __esModule: true,
  default: () => null
}))
// The page's deployment is the build's own; no deployment variable from a
// developer's environment changes it.
jest.mock('@web/modules/social-recovery/shared/client/deployment-env', () => ({
  SEPOLIA_DEPLOYMENT_VARIABLE: 'SOCIAL_RECOVERY_SEPOLIA_DEPLOYMENT',
  sepoliaDeploymentVariable: () => undefined
}))

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const { getAddress, keccak256, zeroAddress }: typeof import('viem') = require('viem')
const {
  ThemeContext
}: typeof import('@common/contexts/themeContext') = require('@common/contexts/themeContext')
const themeConfig: typeof import('@common/styles/themeConfig') = require('@common/styles/themeConfig')
const i18n: typeof import('@common/config/localization').default =
  require('@common/config/localization').default
const {
  addressBookOf,
  descriptorOf,
  WALLET_RECOVERY_CHAIN
}: typeof import('@web/modules/social-recovery/shared/client') = require('@web/modules/social-recovery/shared/client')
const {
  approvalLinkOf
}: typeof import('@web/modules/social-recovery/recovery/checklist') = require('@web/modules/social-recovery/recovery/checklist')
const ApproveScreen: typeof import('@web/modules/social-recovery/guardian-page/ApproveScreen').default =
  require('@web/modules/social-recovery/guardian-page/ApproveScreen').default
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

export const t = (key: string, values?: Record<string, unknown>): string => i18n.t(key, values)

export const DESCRIPTOR = descriptorOf(WALLET_RECOVERY_CHAIN, addressBookOf(WALLET_RECOVERY_CHAIN))
/** The manager the build reads, checksummed as the page draws it. */
export const MANAGER: Address = getAddress(DESCRIPTOR.manager)

/** The account being recovered. */
export const ACCOUNT: Address = getAddress('0x2b0f5e98ee98adc9865745e98802f333f72f6ef5')
/** The key the recovery installs. */
export const NEW_KEY: Address = getAddress('0x7a19c3f0b41d8e5a90cc77b2e4f8135aa62cc204')
/** The key the recovery removes. */
export const REMOVED_KEY: Address = getAddress('0x3fb2c4e8a19d07f6e5c3d1b8a24f9e7c60d1a2a2')
/** A payee the payment order names. */
export const PAYEE: Address = getAddress('0x9a4d000000000000000000000000000000000011')

/** The request's moment of creation and its deadline, 24 hours later, in seconds. */
export const CREATED_AT = 1_800_000_000
export const VALID_UNTIL = CREATED_AT + 86_400

export const PAYLOAD: Hex = '0xabcdef'
export const ATTEMPT_ID = '3'
export const SETUP_NONCE = '2'

/** The approval request one place's link carries. */
export const requestOf = (overrides: Partial<ApproverRequest> = {}): ApproverRequest => ({
  kind: 'recovery-proof-request',
  version: 1,
  purpose: 'approval',
  chainId: String(DESCRIPTOR.chainId),
  manager: DESCRIPTOR.manager,
  digestVersion: DESCRIPTOR.digestVersion,
  account: ACCOUNT,
  action: DESCRIPTOR.action,
  attemptId: ATTEMPT_ID,
  setupNonce: SETUP_NONCE,
  setupBodyHash: `0x${'5e'.repeat(32)}`,
  payload: PAYLOAD,
  validUntil: String(VALID_UNTIL),
  place: 1,
  method: DESCRIPTOR.methodEcdsa,
  config: '0x01',
  salt: '0x02',
  ...overrides
})

/** The extension's full-tab page a link opens. */
export const TAB_URL = 'chrome-extension://kohaku/tab.html'

/** The link to the approval page for a request. */
export const linkOf = (request: ApproverRequest) => approvalLinkOf(request, TAB_URL)

/** The search string the router hands the page for a link. */
export const searchOf = (link: string) => link.slice(link.indexOf('?'))

/** What the orchestrator describes of a request: its values, with the handover decoded. */
export const descriptionOf = (
  request: ApproverRequest,
  overrides: Partial<RequestDescription> = {}
): RequestDescription => ({
  account: request.account,
  chainId: BigInt(request.chainId),
  manager: request.manager,
  action: request.action,
  attemptId: BigInt(request.attemptId),
  setupNonce: BigInt(request.setupNonce),
  purpose: 'approval',
  handover: {
    decoded: true,
    value: { newAuthority: NEW_KEY, removedAuthority: REMOVED_KEY }
  },
  validUntil: Number(request.validUntil),
  place: request.place,
  identityPublic: undefined,
  device: undefined,
  ...overrides
})

/** The manager's empty attempt slot. */
export const NO_ATTEMPT: Attempt = {
  state: 'None',
  attemptId: 0n,
  setupNonce: 0n,
  consumableAfter: 0,
  payloadHash: `0x${'00'.repeat(32)}`,
  order: { token: zeroAddress, amount: 0n, payee: zeroAddress },
  usedMethods: [],
  ignoresPause: false
}

/** The end of the submitted attempt's waiting period, in seconds. */
export const WAIT_ENDS_AT = CREATED_AT + 3 * 86_400

/** The recoverer's submission of the request, waiting out its period. */
export const SUBMITTED: Attempt = {
  ...NO_ATTEMPT,
  state: 'Waiting',
  attemptId: BigInt(ATTEMPT_ID),
  setupNonce: BigInt(SETUP_NONCE),
  consumableAfter: WAIT_ENDS_AT,
  payloadHash: keccak256(PAYLOAD)
}

/** The account's recovery state while the request is live. */
export const recoveryStateOf = (overrides: Partial<RecoveryState> = {}): RecoveryState => ({
  attempt: NO_ATTEMPT,
  nextAttemptId: BigInt(ATTEMPT_ID),
  setupCommitment: `0x${'ab'.repeat(32)}`,
  setupNonce: BigInt(SETUP_NONCE),
  removedKey: REMOVED_KEY,
  block: { number: 200, timestamp: CREATED_AT, hash: `0x${'cd'.repeat(32)}` },
  ...overrides
})

export const kit: KitScript = {
  describeRequest: jest.fn(),
  recoveryState: jest.fn(),
  isAuthorized: jest.fn()
}

/** The ready state of the page's hook over the scripted client. */
export const readyClient = (descriptor = DESCRIPTOR): ClientState =>
  ({
    status: 'ready',
    client: {
      descriptor,
      approving: { describeRequest: (request: ApproverRequest) => kit.describeRequest(request) },
      recovery: { recoveryState: () => kit.recoveryState() },
      action: { isAuthorized: () => kit.isAuthorized() }
    },
    reads: {},
    receipts: {},
    retry: () => {}
  } as unknown as ClientState)

/** Sets the client state the page gets, and renders it. */
export const setClient = (state: ClientState | null) => {
  act(() => {
    mockClient.state = state
    mockClient.listeners.forEach((listener) => listener())
  })
}

/** The accounts the page asked a client for, in order, undefined where it asked for none. */
export const clientAccounts = () => mockClient.accounts

/** The search string the router hands the page. */
export const setSearch = (search: string) => {
  mockLocation.current = { ...mockLocation.current, search }
  mockLocation.listeners.forEach((listener) => listener())
}

/** Puts every edge back: the page's clock at the request's creation and a live request on chain. */
export const resetEdges = () => {
  jest.useFakeTimers('modern')
  jest.setSystemTime(CREATED_AT * 1000)
  window.location.hash = ''
  mockLocation.current = { ...mockLocation.current, search: '' }
  mockClient.accounts = []
  mockClient.state = readyClient()
  kit.describeRequest.mockReset()
  kit.describeRequest.mockImplementation((request) => descriptionOf(request))
  kit.recoveryState.mockReset()
  kit.recoveryState.mockImplementation(async () => recoveryStateOf())
  kit.isAuthorized.mockReset()
  kit.isAuthorized.mockImplementation(async () => true)
}

// ---------------------------------------------------------------------------
// The mount
// ---------------------------------------------------------------------------

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

/** Lets the pending reads settle, then renders what they changed. The fakes answer in microtasks. */
export const settle = () =>
  act(async () => {
    for (let round = 0; round < 10; round += 1) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve()
    }
  })

/** Moves the page's clock and its timers forward, then lets the reads settle. */
export const advance = async (ms: number) => {
  act(() => {
    jest.advanceTimersByTime(ms)
  })
  await settle()
}

/** Opens another link in the same tab: the router hands the mounted page the new search. */
export const navigate = async (search: string) => {
  act(() => setSearch(search))
  await settle()
}

/** Mounts the approval page on the search string the router hands it. */
export const mountPage = async (search: string): Promise<Mounted> => {
  setSearch(search)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)

  await act(async () => {
    root.render(
      <ThemeContext.Provider value={THEME_CONTEXT}>
        <ApproveScreen />
      </ThemeContext.Provider>
    )
  })
  await settle()

  return {
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
    has: (id) => byTestId(id) !== null,
    textOf: (id) => byTestId(id)?.textContent ?? '',
    text: () => container.textContent ?? '',
    press: async (id) => {
      const node = byTestId(id)
      if (!node) {
        throw new Error(`nothing to press: ${id}`)
      }
      act(() => node.click())
      await settle()
    },
    isDisabled: (id) => byTestId(id)?.getAttribute('aria-disabled') === 'true'
  }
}

/** Mounts the page on the search string of a request's link. */
export const mountLive = (request: ApproverRequest = requestOf()) =>
  mountPage(searchOf(linkOf(request)))

// Registered only when Jest runs this file itself: a suite that imports the
// harness does not run its checks again.
const runningHarnessItself = expect.getState().testPath === __filename

const describeHarness = runningHarnessItself ? describe : () => undefined

describeHarness('the approval page harness', () => {
  beforeEach(resetEdges)
  afterEach(() => jest.useRealTimers())

  it('hands the page the scripted client for the request account and reads through it', async () => {
    const page = await mountLive()
    expect(clientAccounts()).toContain(ACCOUNT)
    expect(kit.describeRequest).toHaveBeenCalled()
    expect(kit.recoveryState).toHaveBeenCalledTimes(1)
    expect(kit.isAuthorized).toHaveBeenCalledTimes(1)
    page.unmount()
  })
})
