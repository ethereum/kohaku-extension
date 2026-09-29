/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "chrome-extension://cgjhdpkjghcgpplimocodhjgcceglpoj/tab.html#/social-recovery/ceremony"}
 */
/**
 * The ceremony tab as the route mounts it: the screen under the source a
 * provider above supplies, or, where none does, under the wallet's own, which
 * reads the request a caller stored under the id and builds the client for the
 * account and chain that request names.
 *
 * The extension's local storage is one in-memory `browser.storage.local`, so
 * the caller's records, the tab and the report share it as in the extension.
 * The client build hands out the harness's fakes; the records, the resolver,
 * the provider handling and the screen are real. The shared components are
 * stubs.
 */
import path from 'path'
import * as React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

import type { Network } from '@ambire-common/interfaces/network'
import { getRpcProvider } from '@ambire-common/services/provider/getRpcProvider'
import en from '@common/config/localization/translations/en.json'
import { browser } from '@web/constants/browserapi'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import type { ApproverRequest, DeviceBinding } from '@web/modules/social-recovery/sdk-interfaces'
import type { CeremonyCall } from '@web/modules/social-recovery/shared/ceremony'
import type { CeremonySource } from '@web/modules/social-recovery/shared/ceremony/screen'
import { buildRecoveryClient } from '@web/modules/social-recovery/shared/client/build-client'
import type { CeremonyRequestRecord } from '@web/modules/social-recovery/shared/records'

import {
  ACCOUNT,
  browserDefaults,
  callerParams,
  carries,
  ceremony,
  EXTENSION_ORIGIN,
  fakeAssertion,
  fakeAttestation,
  FakeMethod,
  fakeMethod,
  FakeOrchestrator,
  fakeOrchestrator,
  fixtureRequest,
  flush,
  generatePoint,
  installCredentials,
  loadWithReactJsx,
  methodRunCount,
  P256Point,
  PASSKEY_METHOD,
  PROOF_HEX,
  resetVisibility,
  setVisibility,
  SYNCED_FLAGS
} from './harness'

const mockUi = { isTab: true, isPopup: false, isActionWindow: false }
const mockNetworks: { current: Network[]; listeners: Set<() => void> } = {
  current: [],
  listeners: new Set()
}

jest.mock('@web/utils/uiType', () => ({ getUiType: () => mockUi }))
// The extension's `browser.storage.local`: one in-memory store behind the
// storage helper, read by the records, the report store and the mount sweep.
jest.mock('@web/constants/browserapi', () => {
  const entries = new Map<string, unknown>()
  return {
    ...jest.requireActual('@web/constants/browserapi'),
    isExtension: true,
    browser: {
      storage: {
        local: {
          get: jest.fn(async () => Object.fromEntries(entries)),
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
// The networks controller state as an external store, so a test can push a
// new networks record to the mounted tab.
jest.mock('@web/hooks/useNetworksControllerState', () => {
  const R = jest.requireActual('react')
  const subscribe = (listener: () => void) => {
    mockNetworks.listeners.add(listener)
    return () => mockNetworks.listeners.delete(listener)
  }
  return {
    __esModule: true,
    default: jest.fn(() => ({
      networks: R.useSyncExternalStore(subscribe, () => mockNetworks.current)
    }))
  }
})
jest.mock('@ambire-common/services/provider/getRpcProvider', () => ({
  getRpcProvider: jest.fn()
}))
jest.mock('@web/modules/social-recovery/shared/client/build-client', () => ({
  buildRecoveryClient: jest.fn()
}))
jest.mock('@common/components/Button', () => {
  const R = jest.requireActual('react')
  return {
    __esModule: true,
    default: ({ text, onPress }: { text: string; onPress?: () => void }) =>
      R.createElement('button', { onClick: onPress }, text)
  }
})
jest.mock('@common/components/Panel', () => {
  const R = jest.requireActual('react')
  return {
    __esModule: true,
    default: ({ children }: { children: unknown }) => R.createElement('div', null, children)
  }
})
jest.mock('@common/components/Spinner', () => ({ __esModule: true, default: () => null }))
jest.mock('@common/components/Text', () => {
  const R = jest.requireActual('react')
  return {
    __esModule: true,
    default: ({ children }: { children: unknown }) => R.createElement('p', null, children)
  }
})
jest.mock('@common/hooks/useTheme', () => ({ __esModule: true, default: () => ({ theme: {} }) }))
// The style tables read the app's env module, which loads Expo's ESM builds.
jest.mock('@common/styles/spacings', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => ({}) })
}))
jest.mock('@common/styles/utils/flexbox', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => ({}) })
}))
jest.mock('@common/modules/header/components/Header', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('@web/components/TabLayoutWrapper/TabLayoutWrapper', () => {
  const R = jest.requireActual('react')
  const Box = ({ children }: { children: unknown }) => R.createElement('div', null, children)
  return { __esModule: true, TabLayoutContainer: Box, TabLayoutWrapperMainContent: Box }
})

const buildProvider = getRpcProvider as jest.Mock
const storageGet = browser.storage.local.get as jest.Mock
const buildClient = buildRecoveryClient as jest.Mock
const networksState = useNetworksControllerState as jest.Mock

// React 18.3.0 exports `act` only as `unstable_act`; the react-dom re-export warns on every call.
const act: typeof React.act =
  (React as unknown as { act?: typeof React.act }).act ??
  (React as unknown as { unstable_act: typeof React.act }).unstable_act
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** The route's module, whose default export the route mounts. */
const TAB = path.resolve(__dirname, '../screen/index.ts')
/** The screen alone, with no source of its own. */
const SCREEN = path.resolve(__dirname, '../screen/CeremonyScreen.tsx')

const ID = 'req-1'
const ENROLL_ROUTE = '?call=enroll&method=passkey'
const ENROLL = `${ENROLL_ROUTE}&id=${ID}`
const NOTHING_TO_RUN = en.socialRecovery.ceremony.nothingToRun
const TRY_AGAIN = en.socialRecovery.ceremony.tryAgainAction
const CONTINUE_ON_PHONE = en.socialRecovery.ceremony.continueOnPhone
const SEPOLIA_ID = 11155111
const MAINNET_ID = 1

const network = (overrides: Partial<Network> = {}): Network =>
  ({
    chainId: BigInt(SEPOLIA_ID),
    name: 'Sepolia',
    rpcUrls: ['https://rpc.example/sepolia'],
    selectedRpcUrl: 'https://rpc.example/sepolia',
    rpcProvider: 'rpc',
    ...overrides
  } as Network)

const recorded = {
  enroll: () => ({
    account: ACCOUNT,
    chainId: SEPOLIA_ID,
    method: 'passkey',
    call: 'enroll' as const,
    methodAddress: PASSKEY_METHOD,
    params: callerParams()
  }),
  withRequest: (
    call: 'testAccess' | 'createClaim',
    request: ApproverRequest
  ): CeremonyRequestRecord => ({
    account: ACCOUNT,
    chainId: SEPOLIA_ID,
    method: 'passkey',
    call,
    request,
    params: callerParams()
  })
}

/* eslint-disable global-require, @typescript-eslint/no-var-requires */
/** The records a caller writes, over the extension's storage; loaded after the harness's globals. */
const callerRecords = () => {
  const records =
    require('@web/modules/social-recovery/shared/records') as typeof import('@web/modules/social-recovery/shared/records')
  return records.createWalletRecords({ storage: records.extensionRecordStorage })
}
/* eslint-enable global-require, @typescript-eslint/no-var-requires */

/** What the caller takes from the channel under the id, as a row does. */
const takeReport = (call: CeremonyCall, method = 'passkey') =>
  ceremony().takeCeremonyReport(
    { id: ID, call, method },
    browserDefaults().browserReportStore,
    Date.now()
  )

/** Every report the extension's storage holds, read as the report store reads it. */
const storedReports = async () => {
  const all = (await browser.storage.local.get(null)) as Record<string, unknown>
  const keys = Object.keys(all).filter((key) =>
    key.startsWith(ceremony().CEREMONY_RESULT_KEY_PREFIX)
  )
  return Promise.all(keys.map((key) => browserDefaults().browserReportStore.get(key)))
}

let point: P256Point
let root: Root | null = null
let container: HTMLElement | null = null
let creds: ReturnType<typeof installCredentials>
let method: FakeMethod
let orchestrator: FakeOrchestrator
let providers: { destroy: jest.Mock }[]
let clock: jest.SpyInstance | null = null

/** Moves the wall clock `ms` ahead of now, as a reload or a second tab opened later reads it. */
const later = (ms: number) => {
  const at = Date.now() + ms
  clock = jest.spyOn(Date, 'now').mockReturnValue(at)
}

beforeAll(async () => {
  point = await generatePoint()
})

beforeEach(() => {
  setVisibility('visible', false)
  creds = installCredentials({
    create: async () => fakeAttestation({ flags: SYNCED_FLAGS, point }).credential,
    get: async () => fakeAssertion({ r: BigInt(5), s: BigInt(6) }).credential
  })
  method = fakeMethod()
  orchestrator = fakeOrchestrator(method)
  mockNetworks.current = [network()]
  providers = []
  buildProvider.mockImplementation(() => {
    const provider = { destroy: jest.fn(), send: jest.fn() }
    providers.push(provider)
    return provider
  })
  // The client of the request's account: the fakes' approving side, serving the
  // passkey method, whose module is `PASSKEY_METHOD` whatever the descriptor.
  buildClient.mockImplementation(async () => ({
    approving: orchestrator,
    methodFor: (slug: string) => (slug === 'passkey' ? method : undefined),
    descriptor: {}
  }))
})

afterEach(async () => {
  clock?.mockRestore()
  clock = null
  await act(async () => root?.unmount())
  root = null
  container?.remove()
  creds.restore()
  resetVisibility()
  const all = (await browser.storage.local.get(null)) as Record<string, unknown>
  await browser.storage.local.remove(Object.keys(all))
  buildClient.mockReset()
  buildProvider.mockReset()
  jest.clearAllMocks()
})

/**
 * Renders the route's tab at `search`. With `provide`, a provider above it
 * supplies that source; with `bare`, the screen renders alone, with no tab and
 * no provider; with `strict`, inside React's StrictMode.
 */
const render = async (
  search: string,
  { provide, bare, strict }: { provide?: CeremonySource; bare?: boolean; strict?: boolean } = {}
) => {
  const loaded = loadWithReactJsx(bare ? SCREEN : TAB)
  const Tab = loaded.default as React.ComponentType
  const Provider = loaded.CeremonySourceProvider as React.ComponentType<{
    source: CeremonySource
    children?: React.ReactNode
  }>
  const tab = provide
    ? React.createElement(Provider, { source: provide }, React.createElement(Tab))
    : React.createElement(Tab)
  const page = React.createElement(
    MemoryRouter,
    {
      initialEntries: [`/social-recovery/ceremony${search}`],
      future: { v7_startTransition: true, v7_relativeSplatPath: true }
    },
    tab
  )
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(strict ? React.createElement(React.StrictMode, null, page) : page)
  })
  await act(async () => flush(20))
  return container
}

/** Clicks the one button that reads `text`. */
const press = async (page: HTMLElement, text: string) => {
  const matching = Array.from(page.querySelectorAll('button')).filter((b) => b.textContent === text)
  if (matching.length !== 1) throw new Error(`${matching.length} "${text}" buttons`)
  await act(async () => {
    matching[0].click()
    await flush(20)
  })
}

/** Hands the mounted tab a new networks record, as the controller state pushes one. */
const pushNetworks = async (next: Network[]) => {
  await act(async () => {
    mockNetworks.current = next
    mockNetworks.listeners.forEach((listener) => listener())
    await flush(20)
  })
}

describe('the ceremony tab with no provider above it', () => {
  it('runs the enrollment a caller recorded under the id, and the caller takes its report', async () => {
    await callerRecords().ceremonyRequest(ID).write(recorded.enroll())
    const page = await render(ENROLL)

    expect(buildClient).toHaveBeenCalledTimes(1)
    expect(buildClient.mock.calls[0][0]).toMatchObject({ chain: 'sepolia', account: ACCOUNT })
    expect(buildProvider).toHaveBeenCalledTimes(1)
    expect(buildProvider.mock.calls[0][0]).toBe(mockNetworks.current[0])
    expect(providers[0].destroy).toHaveBeenCalledTimes(1)
    expect(creds.create).toHaveBeenCalledTimes(1)
    expect(orchestrator.enrollInput).toHaveBeenCalledTimes(1)
    expect(orchestrator.enrollInput.mock.calls[0][0]).toBe(PASSKEY_METHOD)
    expect(orchestrator.enrollInput.mock.calls[0][1]).toMatchObject({
      relyingPartyId: EXTENSION_ORIGIN,
      userName: 'holder'
    })
    expect(page.textContent).toContain('Synced passkey')

    const report = await takeReport('enroll')
    expect(report?.outcome).toMatchObject({ kind: 'verdict', verdict: 'passed' })
  })
  ;(['testAccess', 'createClaim'] as const).forEach((call) =>
    it(`runs the ${call} a caller recorded under the id against the recorded request`, async () => {
      const request = fixtureRequest({ place: 2, attemptId: '9' })
      await callerRecords().ceremonyRequest(ID).write(recorded.withRequest(call, request))
      await render(`?call=${call}&method=passkey&id=${ID}`)

      expect(creds.get).toHaveBeenCalledTimes(1)
      expect(orchestrator.signingInput).toHaveBeenCalledTimes(1)
      expect(orchestrator.signingInput.mock.calls[0][0]).toEqual(request)
      const report = await takeReport(call)
      expect(report?.outcome).toMatchObject({ kind: 'verdict', verdict: 'passed' })
    })
  )

  it('leaves the recorded request in place once it reported, for the caller to remove', async () => {
    await callerRecords().ceremonyRequest(ID).write(recorded.enroll())
    await render(ENROLL)
    expect(await storedReports()).toEqual([
      expect.objectContaining({ outcome: expect.objectContaining({ verdict: 'passed' }) })
    ])
    const read = await callerRecords().ceremonyRequest(ID).read()
    expect(read.status === 'present' && read.value).toEqual(recorded.enroll())
  })

  it('reaches the nothing-to-run phase for an id no caller recorded, builds nothing and reports nothing', async () => {
    const page = await render(ENROLL)
    expect(page.textContent).toContain(NOTHING_TO_RUN)
    expect(buildProvider).not.toHaveBeenCalled()
    expect(buildClient).not.toHaveBeenCalled()
    expect(creds.create).not.toHaveBeenCalled()
    expect(await storedReports()).toEqual([])
  })
  ;(
    [
      ['another call', ENROLL_ROUTE, recorded.withRequest('testAccess', fixtureRequest())],
      ['another method', '?call=enroll&method=zkpassport', recorded.enroll()],
      [
        'mainnet, the other recovery chain',
        ENROLL_ROUTE,
        { ...recorded.enroll(), chainId: MAINNET_ID }
      ]
    ] as const
  ).forEach(([what, route, record]) =>
    it(`reaches the nothing-to-run phase for a request recorded for ${what}, and builds nothing`, async () => {
      mockNetworks.current = [network(), network({ chainId: BigInt(MAINNET_ID), name: 'Ethereum' })]
      await callerRecords().ceremonyRequest(ID).write(record)
      const page = await render(`${route}&id=${ID}`)
      expect(page.textContent).toContain(NOTHING_TO_RUN)
      expect(buildProvider).not.toHaveBeenCalled()
      expect(buildClient).not.toHaveBeenCalled()
      expect(methodRunCount(method, orchestrator)).toBe(0)
      expect(await storedReports()).toEqual([])
    })
  )

  it('reaches the nothing-to-run phase for a request naming a module the method does not serve', async () => {
    await callerRecords()
      .ceremonyRequest(ID)
      .write({ ...recorded.enroll(), methodAddress: ACCOUNT })
    const page = await render(ENROLL)
    expect(page.textContent).toContain(NOTHING_TO_RUN)
    expect(methodRunCount(method, orchestrator)).toBe(0)
    expect(await storedReports()).toEqual([])
  })

  it('reports not supported with no retry where the client holds no implementation of the recorded method', async () => {
    await callerRecords()
      .ceremonyRequest(ID)
      .write({ ...recorded.enroll(), method: 'aadhaar' })
    const page = await render(`?call=enroll&method=aadhaar&id=${ID}`)
    expect(buildClient).toHaveBeenCalledTimes(1)
    expect(methodRunCount(method, orchestrator)).toBe(0)
    expect(creds.create).not.toHaveBeenCalled()
    const report = await takeReport('enroll', 'aadhaar')
    expect(report?.outcome).toEqual({
      kind: 'verdict',
      verdict: 'notSupported',
      cause: 'no-implementation',
      retry: false
    })
    expect(page.textContent).not.toContain(NOTHING_TO_RUN)
    expect(page.textContent).not.toContain(TRY_AGAIN)
  })

  const OTHER_BINDINGS: [string, DeviceBinding][] = [
    ['ecdsa', 'none'],
    ['zkpassport', 'external-app'],
    ['aadhaar', 'in-browser-prover']
  ]
  OTHER_BINDINGS.forEach(([slug, binding]) =>
    it(`ends the ${slug} request as not supported with no retry, since the page serves only the browser authenticator`, async () => {
      const other = fakeMethod({}, binding)
      const otherOrchestrator = fakeOrchestrator(other)
      buildClient.mockImplementation(async () => ({
        approving: otherOrchestrator,
        methodFor: (asked: string) => (asked === slug ? other : undefined),
        descriptor: {}
      }))
      await callerRecords()
        .ceremonyRequest(ID)
        .write({ ...recorded.enroll(), method: slug })
      const page = await render(`?call=enroll&method=${slug}&id=${ID}`)
      expect(methodRunCount(other, otherOrchestrator)).toBe(0)
      expect(creds.create).not.toHaveBeenCalled()
      const report = await takeReport('enroll', slug)
      expect(report?.outcome).toEqual({
        kind: 'verdict',
        verdict: 'notSupported',
        cause: 'no-implementation',
        retry: false
      })
      expect(page.textContent).not.toContain(TRY_AGAIN)
    })
  )

  it('runs no second ceremony once the request is older than a report may live, as after a reload or in a second tab', async () => {
    await callerRecords().ceremonyRequest(ID).write(recorded.enroll())
    await render(ENROLL)
    expect(creds.create).toHaveBeenCalledTimes(1)
    await takeReport('enroll')
    await act(async () => root?.unmount())

    later(ceremony().CEREMONY_REPORT_TTL_MS)
    const page = await render(ENROLL)
    expect(page.textContent).toContain(NOTHING_TO_RUN)
    expect(creds.create).toHaveBeenCalledTimes(1)
    expect(buildProvider).toHaveBeenCalledTimes(1)
    expect(buildClient).toHaveBeenCalledTimes(1)
    expect(await storedReports()).toEqual([])
  })

  it('reads no record and builds no provider while the tab is hidden, and runs once it is shown', async () => {
    await callerRecords().ceremonyRequest(ID).write(recorded.enroll())
    storageGet.mockClear()
    setVisibility('hidden', false)
    await render(ENROLL)
    expect(storageGet).not.toHaveBeenCalled()
    expect(networksState).toHaveBeenCalled()
    expect(buildProvider).not.toHaveBeenCalled()
    expect(buildClient).not.toHaveBeenCalled()
    expect(creds.create).not.toHaveBeenCalled()

    await act(async () => {
      setVisibility('visible')
      await flush(20)
    })
    expect(storageGet).toHaveBeenCalled()
    expect(buildClient).toHaveBeenCalledTimes(1)
    expect(creds.create).toHaveBeenCalledTimes(1)
    const report = await takeReport('enroll')
    expect(report?.outcome).toMatchObject({ kind: 'verdict', verdict: 'passed' })
  })

  it("runs a phone hand-off through the wallet's own source and reports on return", async () => {
    let answer: (credential: Credential | null) => void = () => undefined
    creds.get.mockImplementation(
      () =>
        new Promise<Credential | null>((settle) => {
          answer = settle
        })
    )
    await callerRecords()
      .ceremonyRequest(ID)
      .write(recorded.withRequest('testAccess', fixtureRequest()))
    const page = await render(`?call=testAccess&method=passkey&id=${ID}&handOff=phone`)
    expect(page.textContent).toContain(CONTINUE_ON_PHONE)
    const asked = creds.get.mock.calls[0][0] as { publicKey?: { hints?: string[] } }
    expect(asked.publicKey?.hints).toEqual(['hybrid'])
    expect(await storedReports()).toEqual([])

    await act(async () => {
      answer(fakeAssertion({ r: BigInt(5), s: BigInt(6) }).credential)
      await flush(20)
    })
    const report = await takeReport('testAccess')
    expect(report?.outcome).toMatchObject({ kind: 'verdict', verdict: 'passed' })
  })

  it('reads a provider build that throws as unavailable, and its Try again builds again and runs', async () => {
    buildProvider.mockImplementationOnce(() => {
      throw new Error('The RPC list is empty.')
    })
    await callerRecords().ceremonyRequest(ID).write(recorded.enroll())
    const page = await render(ENROLL)
    expect(buildClient).not.toHaveBeenCalled()
    expect(await storedReports()).toEqual([
      expect.objectContaining({
        outcome: expect.objectContaining({ verdict: 'unavailable', retry: true })
      })
    ])
    expect(page.textContent).not.toContain('The RPC list is empty.')

    await press(page, TRY_AGAIN)
    expect(buildProvider).toHaveBeenCalledTimes(2)
    expect(creds.create).toHaveBeenCalledTimes(1)
    const report = await takeReport('enroll')
    expect(report?.outcome).toMatchObject({ kind: 'verdict', verdict: 'passed' })
  })

  it('reads a client it cannot build as unavailable, and its Try again builds the client and runs', async () => {
    mockNetworks.current = []
    await callerRecords().ceremonyRequest(ID).write(recorded.enroll())
    const page = await render(ENROLL)
    expect(buildProvider).not.toHaveBeenCalled()
    expect(creds.create).not.toHaveBeenCalled()
    expect(await storedReports()).toEqual([
      expect.objectContaining({ outcome: expect.objectContaining({ verdict: 'unavailable' }) })
    ])

    await pushNetworks([network()])
    await press(page, TRY_AGAIN)
    expect(buildClient).toHaveBeenCalledTimes(1)
    expect(creds.create).toHaveBeenCalledTimes(1)
    const report = await takeReport('enroll')
    expect(report?.outcome).toMatchObject({ kind: 'verdict', verdict: 'passed' })
  })

  it('reads a client build that rejects as unavailable with a retry', async () => {
    buildClient.mockRejectedValueOnce(new Error('the provider did not answer'))
    await callerRecords().ceremonyRequest(ID).write(recorded.enroll())
    const page = await render(ENROLL)
    expect(providers[0].destroy).toHaveBeenCalledTimes(1)
    const report = await takeReport('enroll')
    expect(report?.outcome).toMatchObject({ kind: 'verdict', verdict: 'unavailable', retry: true })
    expect(page.textContent).toContain(TRY_AGAIN)
    expect(page.textContent).not.toContain('the provider did not answer')
  })

  it('keeps the running ceremony when the networks update: one client, one prompt, one report', async () => {
    let finish: (proof: typeof PROOF_HEX) => void = () => undefined
    method.replyFrom.mockImplementation(
      () =>
        new Promise<typeof PROOF_HEX>((resolve) => {
          finish = resolve
        })
    )
    await callerRecords()
      .ceremonyRequest(ID)
      .write(recorded.withRequest('createClaim', fixtureRequest()))
    await render(`?call=createClaim&method=passkey&id=${ID}`)
    expect(method.replyFrom).toHaveBeenCalledTimes(1)

    await pushNetworks([network({ selectedRpcUrl: 'https://rpc.example/other' })])
    await act(async () => {
      finish(PROOF_HEX)
      await flush(20)
    })
    expect(buildClient).toHaveBeenCalledTimes(1)
    expect(creds.get).toHaveBeenCalledTimes(1)
    const reports = await storedReports()
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({ outcome: { kind: 'verdict', verdict: 'passed' } })
  })

  it('starts the ceremony once inside React StrictMode', async () => {
    await callerRecords().ceremonyRequest(ID).write(recorded.enroll())
    await render(ENROLL, { strict: true })
    expect(creds.create).toHaveBeenCalledTimes(1)
    expect(await storedReports()).toHaveLength(1)
    const report = await takeReport('enroll')
    expect(report?.outcome).toMatchObject({ kind: 'verdict', verdict: 'passed' })
  })
  ;(
    [
      ['no request is recorded', async () => undefined],
      [
        'the request is older than a report may live',
        async () => {
          await callerRecords().ceremonyRequest(ID).write(recorded.enroll())
          later(ceremony().CEREMONY_REPORT_TTL_MS + 1)
        }
      ],
      [
        'the request is on mainnet',
        async () => {
          await callerRecords()
            .ceremonyRequest(ID)
            .write({ ...recorded.enroll(), chainId: MAINNET_ID })
        }
      ],
      [
        'building the provider throws',
        async () => {
          buildProvider.mockImplementationOnce(() => {
            throw new Error('The RPC list is empty.')
          })
          await callerRecords().ceremonyRequest(ID).write(recorded.enroll())
        }
      ],
      [
        'the extension holds no network for the chain',
        async () => {
          mockNetworks.current = []
          await callerRecords().ceremonyRequest(ID).write(recorded.enroll())
        }
      ],
      [
        'the client build rejects',
        async () => {
          buildClient.mockRejectedValueOnce(new Error('the provider did not answer'))
          await callerRecords().ceremonyRequest(ID).write(recorded.enroll())
        }
      ]
    ] as const
  ).forEach(([where, arrange]) =>
    it(`never reports that it holds no implementation where ${where}`, async () => {
      await arrange()
      const page = await render(ENROLL)
      expect(carries(await storedReports(), { strings: ['no-implementation'] })).toBe(false)
      expect(await storedReports()).not.toContainEqual(
        expect.objectContaining({ outcome: expect.objectContaining({ verdict: 'notSupported' }) })
      )
      expect(page.textContent).not.toContain('Not supported')
    })
  )
})

describe('the ceremony tab under a provider', () => {
  const fakeStore = () => ({
    get: jest.fn<Promise<unknown>, [string, unknown?]>(async () => null),
    set: jest.fn<Promise<null>, [string, unknown]>(async () => null),
    remove: jest.fn<Promise<null>, [string]>(async () => null)
  })

  it("runs the ceremony the provider's source resolves, and never reads the wallet's own", async () => {
    await callerRecords().ceremonyRequest(ID).write(recorded.enroll())
    const store = fakeStore()
    const resolve = jest.fn(async () => ({
      orchestrator,
      method,
      methodAddress: ACCOUNT,
      params: callerParams()
    }))
    await render(ENROLL, { provide: { resolve, store } })

    expect(resolve).toHaveBeenCalledTimes(1)
    expect(resolve).toHaveBeenCalledWith({
      call: 'enroll',
      method: 'passkey',
      id: ID,
      handOff: false
    })
    expect(orchestrator.enrollInput.mock.calls[0][0]).toBe(ACCOUNT)
    expect(networksState).not.toHaveBeenCalled()
    expect(buildProvider).not.toHaveBeenCalled()
    expect(buildClient).not.toHaveBeenCalled()
    expect(store.set).toHaveBeenCalledTimes(1)
    expect((store.set.mock.calls[0][1] as { outcome: unknown }).outcome).toMatchObject({
      kind: 'verdict',
      verdict: 'passed'
    })
    expect(await storedReports()).toEqual([])
  })

  it('reaches the nothing-to-run phase where the source resolves null, and prompts and reports nothing', async () => {
    const store = fakeStore()
    const resolve = jest.fn(async () => null)
    const page = await render(ENROLL, { provide: { resolve, store } })
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(page.textContent).toContain(NOTHING_TO_RUN)
    expect(creds.create).not.toHaveBeenCalled()
    expect(store.set).not.toHaveBeenCalled()
  })

  it('reports not supported with no retry where the source refuses the method, and prompts nothing', async () => {
    const store = fakeStore()
    const resolve = jest.fn(async () => ({ refused: 'no-implementation' as const }))
    const page = await render(ENROLL, { provide: { resolve, store } })
    expect(store.set).toHaveBeenCalledTimes(1)
    expect((store.set.mock.calls[0][1] as { outcome: unknown }).outcome).toEqual({
      kind: 'verdict',
      verdict: 'notSupported',
      cause: 'no-implementation',
      retry: false
    })
    expect(creds.create).not.toHaveBeenCalled()
    expect(methodRunCount(method, orchestrator)).toBe(0)
    expect(page.textContent).not.toContain(NOTHING_TO_RUN)
    expect(page.textContent).not.toContain(TRY_AGAIN)
  })

  it('reads a source whose resolve throws as unavailable with a retry', async () => {
    const store = fakeStore()
    const resolve = jest.fn(async () => {
      throw new Error('the records did not answer')
    })
    const page = await render(ENROLL, { provide: { resolve, store } })
    expect((store.set.mock.calls[0][1] as { outcome: unknown }).outcome).toMatchObject({
      kind: 'verdict',
      verdict: 'unavailable',
      retry: true
    })
    expect(page.textContent).toContain(TRY_AGAIN)
  })

  it('reports not supported with no retry where the source has no resolver, and builds no client of its own', async () => {
    await callerRecords().ceremonyRequest(ID).write(recorded.enroll())
    const store = fakeStore()
    const page = await render(ENROLL, { provide: { store } })
    expect(store.set).toHaveBeenCalledTimes(1)
    expect((store.set.mock.calls[0][1] as { outcome: unknown }).outcome).toEqual({
      kind: 'verdict',
      verdict: 'notSupported',
      cause: 'no-implementation',
      retry: false
    })
    expect(creds.create).not.toHaveBeenCalled()
    expect(buildClient).not.toHaveBeenCalled()
    expect(page.textContent).not.toContain(TRY_AGAIN)
  })
})

describe('the ceremony screen with no source above it', () => {
  it('reports not supported with no retry, since it holds no implementation, and prompts nothing', async () => {
    await callerRecords().ceremonyRequest(ID).write(recorded.enroll())
    const page = await render(ENROLL, { bare: true })
    const report = await takeReport('enroll')
    expect(report?.outcome).toEqual({
      kind: 'verdict',
      verdict: 'notSupported',
      cause: 'no-implementation',
      retry: false
    })
    expect(creds.create).not.toHaveBeenCalled()
    expect(buildClient).not.toHaveBeenCalled()
    expect(page.textContent).not.toContain(TRY_AGAIN)
  })
})
