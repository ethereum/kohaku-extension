/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "chrome-extension://cgjhdpkjghcgpplimocodhjgcceglpoj/tab.html#/social-recovery/ceremony"}
 */
/**
 * The repository's Jest config compiles TSX with `jsx: react-native`, which
 * keeps the JSX, so a test cannot import a component. This file loads the
 * screen through the harness, which transpiles it with the TypeScript
 * compiler's React JSX and evaluates it under Jest's own `require`, so every
 * import resolves through the aliases and the mocks below. The shared
 * components are stubs; the ceremony module, i18next and en.json are real.
 */
import path from 'path'
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import {
  callerParams,
  carries,
  ceremony,
  enrollFailure,
  fakeAssertion,
  fakeAttestation,
  fakeMethod,
  fakeOrchestrator,
  fixtureRequest,
  flush,
  generatePoint,
  installCredentials,
  loadWithReactJsx,
  MethodScript,
  methodRunCount,
  notAllowedError,
  P256Point,
  PASSKEY_METHOD,
  PROOF_HEX,
  replyFailure,
  resetVisibility,
  setVisibility,
  SYNCED_FLAGS
} from '@web/modules/social-recovery/shared/ceremony/__tests__/harness'

const mockUi = { isTab: true, isPopup: false, isActionWindow: false }
const mockSource: { current: Record<string, unknown>; listeners: Set<() => void> } = {
  current: {},
  listeners: new Set()
}

jest.mock('@web/utils/uiType', () => ({ getUiType: () => mockUi }))
// The keys the mount sweep reads: jsdom gives an extension origin no storage,
// so the test names the keys the store holds.
const mockReportKeys = jest.fn(async (): Promise<string[]> => [])
jest.mock('@web/modules/social-recovery/shared/ceremony/screen/browserDefaults', () => ({
  ...jest.requireActual('@web/modules/social-recovery/shared/ceremony/screen/browserDefaults'),
  browserReportKeys: () => mockReportKeys()
}))
// The source is an external store, so a test can hand the mounted tab a new
// one the way a provider that re-renders with another value would.
jest.mock('@web/modules/social-recovery/shared/ceremony/screen/CeremonySource', () => {
  const R = jest.requireActual('react')
  const subscribe = (listener: () => void) => {
    mockSource.listeners.add(listener)
    return () => mockSource.listeners.delete(listener)
  }
  return {
    __esModule: true,
    useCeremonySource: () => R.useSyncExternalStore(subscribe, () => mockSource.current),
    CeremonySourceProvider: ({ children }: { children: unknown }) => children
  }
})
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

const SCREEN = path.resolve(__dirname, '../screen/CeremonyScreen.tsx')

/** The source module, which this file mocks. */
const SOURCE = path.resolve(__dirname, '../screen/CeremonySource')

/** The screen, transpiled with React JSX and evaluated under Jest's require, over the mocked source. */
const loadScreen = (): React.ComponentType =>
  loadWithReactJsx(SCREEN, { mocked: [SOURCE] }).default as React.ComponentType

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let point: P256Point
let root: Root | null = null
let container: HTMLElement | null = null
let printedErrors = 0

beforeAll(async () => {
  point = await generatePoint()
  // react-dom 18.3 deprecates its test-utils act, and this React build has no
  // other: the one warning is dropped, every other error still prints.
  // eslint-disable-next-line no-console
  const printError = console.error.bind(console)
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('ReactDOMTestUtils.act')) {
      return
    }
    printedErrors += 1
    printError(...args)
  })
})

afterAll(() => {
  jest.restoreAllMocks()
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  container?.remove()
  resetVisibility()
  mockUi.isTab = true
  mockUi.isPopup = false
  mockUi.isActionWindow = false
  mockReportKeys.mockReset()
  mockReportKeys.mockImplementation(async () => [])
})

const fakeStore = () => ({
  get: jest.fn<Promise<unknown>, [string, unknown?]>(async () => null),
  set: jest.fn<Promise<null>, [string, unknown]>(async () => null),
  remove: jest.fn<Promise<null>, [string]>(async () => null)
})

/**
 * Renders the tab at `search`. With `from`, the tab was opened from that page;
 * with `strict`, it renders inside React's StrictMode.
 */
const render = async (
  search: string,
  { from, strict }: { from?: string; strict?: boolean } = {}
) => {
  const Screen = loadScreen()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const tab = `/social-recovery/ceremony${search}`
  const routed = from
    ? React.createElement(
        Routes,
        null,
        React.createElement(Route, {
          path: '/social-recovery/ceremony',
          element: React.createElement(Screen)
        }),
        React.createElement(Route, {
          path: from,
          element: React.createElement('p', null, `the page at ${from}`)
        })
      )
    : React.createElement(Screen)
  const page = React.createElement(
    MemoryRouter,
    {
      initialEntries: from ? [from, tab] : [tab],
      initialIndex: from ? 1 : 0,
      future: { v7_startTransition: true, v7_relativeSplatPath: true }
    },
    routed
  )
  await act(async () => {
    root?.render(strict ? React.createElement(React.StrictMode, null, page) : page)
  })
  await act(async () => flush(20))
  return container
}

/** Hands the mounted tab a new source. */
const swapSource = async (next: Record<string, unknown>) => {
  await act(async () => {
    mockSource.current = next
    mockSource.listeners.forEach((listener) => listener())
    await flush(20)
  })
}

const source = (script: MethodScript = {}) => {
  const method = fakeMethod(script)
  const orchestrator = fakeOrchestrator(method)
  const store = fakeStore()
  const resolve = jest.fn(async () => ({
    orchestrator,
    method,
    methodAddress: PASSKEY_METHOD,
    params: callerParams(),
    request: fixtureRequest()
  }))
  mockSource.current = { resolve, store, visibility: document }
  return { method, orchestrator, store, resolve }
}

const ENROLL = '?call=enroll&method=passkey&id=req-1'
const TEST = '?call=testAccess&method=passkey&id=req-1'
const CLAIM = '?call=createClaim&method=passkey&id=req-1'

/** The outcome of the one report the tab wrote. */
const reported = (store: ReturnType<typeof fakeStore>) =>
  (store.set.mock.calls[0][1] as { outcome: unknown }).outcome

/** Clicks the one button that reads `text`. */
const press = async (page: HTMLElement, text: string) => {
  const buttons = Array.from(page.querySelectorAll('button'))
  const matching = buttons.filter((b) => b.textContent === text)
  if (matching.length !== 1) {
    throw new Error(
      `${matching.length} "${text}" buttons among: ${buttons.map((b) => b.textContent).join(', ')}`
    )
  }
  await act(async () => {
    matching[0].click()
    await flush(20)
  })
}

describe('the ceremony tab screen', () => {
  let creds: ReturnType<typeof installCredentials>

  beforeEach(() => {
    creds = installCredentials({
      create: async () => fakeAttestation({ flags: SYNCED_FLAGS, point }).credential,
      get: async () => fakeAssertion({ r: BigInt(5), s: BigInt(6) }).credential
    })
  })

  afterEach(() => creds.restore())

  it('runs an enrollment in a visible full tab and writes its report', async () => {
    setVisibility('visible', false)
    const { resolve, store } = source()
    const page = await render(ENROLL)
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(creds.create).toHaveBeenCalledTimes(1)
    expect(store.set).toHaveBeenCalledTimes(1)
    expect(store.set.mock.calls[0][0]).toBe('socialRecoveryCeremonyResult:req-1')
    expect(page.textContent).toContain('Synced passkey')
  })

  // The screen keeps the full-tab rule itself as well as TabOnlyRoute.
  ;[
    ['the action popup', { isTab: false, isPopup: true, isActionWindow: false }],
    ['an action window', { isTab: false, isPopup: false, isActionWindow: true }]
  ].forEach(([where, ui]) =>
    it(`resolves, prompts and reports nothing in ${where as string}`, async () => {
      Object.assign(mockUi, ui)
      setVisibility('visible', false)
      const { resolve, store } = source()
      const page = await render(ENROLL)
      expect(resolve).not.toHaveBeenCalled()
      expect(creds.create).not.toHaveBeenCalled()
      expect(store.set).not.toHaveBeenCalled()
      expect(page.textContent).toContain('This step continues in a new tab.')
    })
  )

  it('resolves and prompts nothing while hidden, then runs once shown', async () => {
    setVisibility('hidden', false)
    const { resolve, store } = source()
    await render(ENROLL)
    expect(resolve).not.toHaveBeenCalled()
    expect(creds.create).not.toHaveBeenCalled()
    expect(store.set).not.toHaveBeenCalled()

    await act(async () => {
      setVisibility('visible')
      await flush(20)
    })
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(creds.create).toHaveBeenCalledTimes(1)
    expect(store.set).toHaveBeenCalledTimes(1)
  })

  it('reads a resolver that fails as unavailable, with a retry', async () => {
    setVisibility('visible', false)
    const { store } = source()
    ;(mockSource.current as { resolve: jest.Mock }).resolve.mockRejectedValueOnce(
      new Error('the records did not answer')
    )
    const page = await render(ENROLL)
    expect(reported(store)).toMatchObject({ kind: 'verdict', verdict: 'unavailable', retry: true })
    expect(page.textContent).toContain('Try again')
    expect(page.textContent).not.toContain('the records did not answer')
  })

  it('shows no raw cause slug and no English message of the method', async () => {
    setVisibility('visible', false)
    const { store } = source({
      configFrom: { throws: new Error('an English refusal from the method') }
    })
    const page = await render(ENROLL)
    expect(reported(store)).toMatchObject({ kind: 'verdict', verdict: 'failed' })
    const text = page.textContent ?? ''
    expect(text).not.toContain('an English refusal from the method')
    const slugs = [...ceremony().HOST_CAUSES, 'material-rejected', 'device-unavailable']
    slugs.forEach((slug) => expect(text).not.toContain(slug))
    expect(text).toContain('Failed · Try again')
  })

  it("shows the browser's error name beside test failed", async () => {
    setVisibility('visible', false)
    creds.restore()
    creds = installCredentials({
      get: async () => {
        throw notAllowedError()
      }
    })
    const { store } = source()
    const page = await render(TEST)
    expect(reported(store)).toMatchObject({ kind: 'verdict', verdict: 'failed' })
    const text = page.textContent ?? ''
    expect(text).toContain('Test failed')
    expect(text).toContain('NotAllowedError')
    expect(text).toContain('This method may never work.')
    expect(text).not.toContain('Not tested')
    expect(text).not.toContain('The operation either timed out')
  })

  it('shows "Cancelled" for a claim whose prompt was dismissed', async () => {
    setVisibility('visible', false)
    creds.restore()
    creds = installCredentials({
      get: async () => {
        throw notAllowedError()
      }
    })
    const { store, method, orchestrator } = source()
    const page = await render(CLAIM)
    expect(reported(store)).toMatchObject({ kind: 'dismissed', note: 'cancelled' })
    const text = page.textContent ?? ''
    expect(text).toContain('Cancelled')
    expect(text).not.toContain('Test failed')
    expect(text).not.toContain('NotAllowedError')
    expect(methodRunCount(method, orchestrator)).toBe(0)
  })

  // An enrollment or a claim is not a test.
  ;[
    ['an enrollment', ENROLL, { configFrom: enrollFailure('device-unavailable') }],
    ['a claim', CLAIM, { replyFrom: replyFailure('device-unavailable') }]
  ].forEach(([what, search, script]) =>
    it(`shows the unavailable note and no test line for ${
      what as string
    } that could not run`, async () => {
      setVisibility('visible', false)
      const { store } = source(script as MethodScript)
      const page = await render(search as string)
      expect(reported(store)).toMatchObject({ kind: 'verdict', verdict: 'unavailable' })
      const text = page.textContent ?? ''
      expect(text).toContain('Could not run · the service did not answer · Try again')
      expect(text).not.toContain('The check could not run.')
      expect(text).not.toContain('Test unavailable')
    })
  )

  it('shows the test line and chip for a test that could not run', async () => {
    setVisibility('visible', false)
    const { store } = source({ verify: 'not-judged' })
    const page = await render(TEST)
    expect(reported(store)).toMatchObject({ kind: 'verdict', verdict: 'unavailable' })
    const text = page.textContent ?? ''
    expect(text).toContain('Test unavailable')
    expect(text).toContain('The check could not run. The verifier could not be reached.')
    expect(text).not.toContain('Could not run · the service did not answer')
  })
  ;[
    ['a passed test access', TEST],
    ['a passed claim', CLAIM]
  ].forEach(([what, search]) =>
    it(`names the proof the method returned in the note of ${what}`, async () => {
      setVisibility('visible', false)
      source({ replyFrom: `0x${'ab'.repeat(6)}${'00'.repeat(40)}${'cd'.repeat(3)}` })
      const page = await render(search)
      expect(page.textContent).toContain('check 0xabababababab…cdcdcd · passed just now')
    })
  )
})

describe('the mount sweep of expired reports', () => {
  const STALE = 'socialRecoveryCeremonyResult:old'

  beforeEach(() => {
    mockReportKeys.mockImplementation(async () => [STALE, 'someOtherKey'])
  })

  it('reads and removes nothing while the tab is hidden', async () => {
    setVisibility('hidden', false)
    const { store } = source()
    await render(ENROLL)
    expect(mockReportKeys).not.toHaveBeenCalled()
    expect(store.get).not.toHaveBeenCalled()
    expect(store.remove).not.toHaveBeenCalled()
  })

  it('removes the expired report once the tab is shown, and nothing else', async () => {
    const creds = installCredentials({
      create: async () => fakeAttestation({ flags: SYNCED_FLAGS, point }).credential
    })
    setVisibility('hidden', false)
    const { store } = source()
    await render(ENROLL)
    await act(async () => {
      setVisibility('visible')
      await flush(20)
    })
    expect(mockReportKeys).toHaveBeenCalledTimes(1)
    expect(store.remove).toHaveBeenCalledWith(STALE)
    expect(store.remove).not.toHaveBeenCalledWith('someOtherKey')
    creds.restore()
  })
})

describe('a hand-off that returns after eleven minutes', () => {
  it('writes the report stamped on return, and the row still takes it', async () => {
    const { takeCeremonyReport, CEREMONY_REPORT_TTL_MS } = ceremony()
    let clock = new Date('2026-09-24T12:00:00Z').getTime()
    const dateNow = jest.spyOn(Date, 'now').mockImplementation(() => clock)
    setVisibility('visible', false)
    // The holder switches away while the phone answers.
    const creds = installCredentials({
      get: async () => {
        setVisibility('hidden')
        return fakeAssertion({ r: BigInt(5), s: BigInt(6) }).credential
      }
    })
    const { store } = source()
    const map = new Map<string, unknown>()
    store.set.mockImplementation(async (key: string, value: unknown) => {
      map.set(key, value)
      return null
    })
    store.get.mockImplementation(async (key: string, fallback?: unknown) =>
      map.has(key) ? map.get(key) : fallback
    )
    store.remove.mockImplementation(async (key: string) => {
      map.delete(key)
      return null
    })

    await render(`${TEST}&handOff=phone`)
    expect(creds.get).toHaveBeenCalledTimes(1)
    expect(store.set).not.toHaveBeenCalled()

    clock += 11 * 60 * 1000
    const shownAt = clock
    await act(async () => {
      setVisibility('visible')
      await flush(20)
    })
    expect(store.set).toHaveBeenCalledTimes(1)
    const written = store.set.mock.calls[0][1] as { reportedAt: number; expiresAt: number }
    expect(written.reportedAt).toBe(shownAt)
    expect(written.expiresAt).toBe(shownAt + CEREMONY_REPORT_TTL_MS)

    clock += 5_000
    const report = await takeCeremonyReport(
      { id: 'req-1', call: 'testAccess', method: 'passkey' },
      store,
      Date.now()
    )
    expect(report).toMatchObject({ outcome: { kind: 'verdict', verdict: 'passed' } })
    creds.restore()
    dateNow.mockRestore()
  })
})

describe('a cancel while the method still runs', () => {
  it('writes the cancelled report and no claim', async () => {
    const creds = installCredentials({
      get: async () => fakeAssertion({ r: BigInt(5), s: BigInt(6) }).credential
    })
    setVisibility('visible', false)
    const { method, store } = source()
    let finish: (proof: typeof PROOF_HEX) => void = () => undefined
    method.replyFrom.mockImplementation(
      () =>
        new Promise<typeof PROOF_HEX>((resolve) => {
          finish = resolve
        })
    )
    const page = await render(CLAIM)
    expect(method.replyFrom).toHaveBeenCalledTimes(1)
    expect(store.set).not.toHaveBeenCalled()

    await press(page, 'Cancel')
    await act(async () => {
      finish(PROOF_HEX)
      await flush(20)
    })
    expect(store.set).toHaveBeenCalledTimes(1)
    expect(reported(store)).toMatchObject({ kind: 'dismissed', note: 'cancelled' })
    expect(carries(store.set.mock.calls, { strings: [PROOF_HEX] })).toBe(false)
    expect(page.textContent).toContain('Cancelled')
    expect(page.textContent).not.toContain('passed just now')
    creds.restore()
  })
})

const DELIVERY_FAILED = 'Not delivered · the result did not reach the row'
const CLAIM_IDENTITY = { id: 'req-1', call: 'createClaim', method: 'passkey' } as const
const refusal = () => new Error('QUOTA_BYTES quota exceeded')

let browser: ReturnType<typeof installCredentials> | null = null

afterEach(() => {
  browser?.restore()
  browser = null
})

/** A browser that answers the claim's prompt; with `hide`, the holder switched away first. */
const answeringBrowser = (hide = false) => {
  browser = installCredentials({
    get: async () => {
      if (hide) {
        setVisibility('hidden')
      }
      return fakeAssertion({ r: BigInt(5), s: BigInt(6) }).credential
    }
  })
  return browser
}

/** Backs a fake store with a map, and plays each write to the listeners of its key. */
const backWithMap = (store: ReturnType<typeof fakeStore>) => {
  const map = new Map<string, unknown>()
  const listeners = new Map<string, Set<(value: unknown) => void>>()
  store.set.mockImplementation(async (key, value) => {
    map.set(key, value)
    listeners.get(key)?.forEach((listener) => listener(value))
    return null
  })
  store.get.mockImplementation(async (key, fallback) => (map.has(key) ? map.get(key) : fallback))
  store.remove.mockImplementation(async (key) => {
    map.delete(key)
    return null
  })
  const subscribe = (key: string, onValue: (value: unknown) => void) => {
    const keyListeners = listeners.get(key) ?? new Set()
    keyListeners.add(onValue)
    listeners.set(key, keyListeners)
    return () => {
      keyListeners.delete(onValue)
    }
  }
  return { map, subscribe }
}

describe('a report the store fails to write', () => {
  it('keeps the result and offers a retry that writes the same report with no new ceremony', async () => {
    const creds = answeringBrowser()
    setVisibility('visible', false)
    const { method, orchestrator, store, resolve } = source()
    const { map } = backWithMap(store)
    store.set.mockRejectedValueOnce(refusal())

    const page = await render(CLAIM)
    expect(store.set).toHaveBeenCalledTimes(1)
    expect(map.size).toBe(0)
    const text = page.textContent ?? ''
    expect(text).toContain('passed just now')
    expect(text).toContain(DELIVERY_FAILED)
    expect(text).not.toContain('QUOTA_BYTES')
    const ran = methodRunCount(method, orchestrator)

    await press(page, 'Try again')
    expect(store.set).toHaveBeenCalledTimes(2)
    expect(creds.get).toHaveBeenCalledTimes(1)
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(methodRunCount(method, orchestrator)).toBe(ran)
    expect(page.textContent).not.toContain(DELIVERY_FAILED)

    const report = await ceremony().takeCeremonyReport(CLAIM_IDENTITY, store, Date.now())
    expect(report?.outcome).toMatchObject({ kind: 'verdict', verdict: 'passed' })
    expect(report?.outcome).toEqual((store.set.mock.calls[0][1] as { outcome: unknown }).outcome)
  })

  it('stamps the retried write at the time of the retry', async () => {
    answeringBrowser()
    let clock = new Date('2026-09-24T12:00:00Z').getTime()
    const dateNow = jest.spyOn(Date, 'now').mockImplementation(() => clock)
    try {
      setVisibility('visible', false)
      const { store } = source()
      store.set.mockRejectedValueOnce(refusal())
      const page = await render(CLAIM)
      const refusedAt = clock

      clock += 4 * 60 * 1000
      await press(page, 'Try again')
      const [refused, retried] = store.set.mock.calls.map(
        (call) => call[1] as { reportedAt: number; expiresAt: number }
      )
      expect(refused.reportedAt).toBe(refusedAt)
      expect(retried.reportedAt).toBe(refusedAt + 4 * 60 * 1000)
      expect(retried.expiresAt).toBe(retried.reportedAt + ceremony().CEREMONY_REPORT_TTL_MS)
    } finally {
      dateNow.mockRestore()
    }
  })

  it('leaves through Back to the page that opened the tab, and writes nothing more', async () => {
    answeringBrowser()
    setVisibility('visible', false)
    const { store } = source()
    store.set.mockRejectedValueOnce(refusal())
    const page = await render(CLAIM, { from: '/social-recovery/setup' })
    expect(page.textContent).toContain(DELIVERY_FAILED)

    await press(page, 'Back')
    expect(page.textContent).toBe('the page at /social-recovery/setup')
    expect(store.set).toHaveBeenCalledTimes(1)
  })

  it('delivers the retried write to a caller that listens for it', async () => {
    answeringBrowser()
    setVisibility('visible', false)
    const { store } = source()
    const { map, subscribe } = backWithMap(store)
    store.set.mockRejectedValueOnce(refusal())
    const onReport = jest.fn()
    const stop = ceremony().listenForCeremonyReport(CLAIM_IDENTITY, subscribe, store, onReport)

    const page = await render(CLAIM)
    expect(onReport).not.toHaveBeenCalled()

    await press(page, 'Try again')
    expect(onReport).toHaveBeenCalledTimes(1)
    expect(onReport.mock.calls[0][0]).toMatchObject({
      ...CLAIM_IDENTITY,
      outcome: { kind: 'verdict', verdict: 'passed' }
    })
    expect(map.size).toBe(0)
    stop()
  })

  it('retries into the store the tab holds now, after a store swap', async () => {
    const creds = answeringBrowser()
    setVisibility('visible', false)
    const { store } = source()
    store.set.mockRejectedValueOnce(refusal())
    const page = await render(CLAIM)
    expect(page.textContent).toContain(DELIVERY_FAILED)

    const next = fakeStore()
    await swapSource({ ...mockSource.current, store: next })
    await press(page, 'Try again')
    expect(store.set).toHaveBeenCalledTimes(1)
    expect(next.set).toHaveBeenCalledTimes(1)
    expect((next.set.mock.calls[0][1] as { outcome: unknown }).outcome).toMatchObject({
      kind: 'verdict',
      verdict: 'passed'
    })
    expect(creds.get).toHaveBeenCalledTimes(1)
    expect(page.textContent).not.toContain(DELIVERY_FAILED)
  })
})

describe('a gate replaced while the report waits', () => {
  it('reads undelivered, and the retry writes through the new gate', async () => {
    setVisibility('visible', false)
    const creds = answeringBrowser(true)
    const { store } = source()
    const page = await render(CLAIM)
    expect(creds.get).toHaveBeenCalledTimes(1)
    expect(page.textContent).toContain('Keep this tab open.')
    expect(store.set).not.toHaveBeenCalled()

    const next = fakeStore()
    await swapSource({ ...mockSource.current, store: next })
    expect(page.textContent).toContain(DELIVERY_FAILED)
    expect(page.textContent).toContain('passed just now')

    await act(async () => {
      setVisibility('visible')
      await flush(20)
    })
    expect(store.set).not.toHaveBeenCalled()
    expect(next.set).not.toHaveBeenCalled()

    await press(page, 'Try again')
    expect(next.set).toHaveBeenCalledTimes(1)
    expect((next.set.mock.calls[0][1] as { outcome: unknown }).outcome).toMatchObject({
      kind: 'verdict',
      verdict: 'passed'
    })
    expect(store.set).not.toHaveBeenCalled()
    expect(creds.get).toHaveBeenCalledTimes(1)
  })
})

describe('a tab closed while its report waits', () => {
  it('writes nothing and reports nothing, even once the page is shown again', async () => {
    setVisibility('visible', false)
    answeringBrowser(true)
    const { store } = source()
    const errors = printedErrors
    await render(CLAIM)
    expect(store.set).not.toHaveBeenCalled()

    await act(async () => root?.unmount())
    root = null
    await act(async () => {
      setVisibility('visible')
      await flush(20)
    })
    expect(store.set).not.toHaveBeenCalled()
    expect(container?.textContent).toBe('')
    expect(printedErrors).toBe(errors)
  })
})

describe('a cancel while the ceremony resolves', () => {
  it('writes the cancelled report, not unavailable, when the resolve then fails', async () => {
    const creds = answeringBrowser()
    setVisibility('visible', false)
    const { store, resolve } = source()
    let fail: (error: Error) => void = () => undefined
    resolve.mockImplementation(
      () =>
        new Promise<never>((_, reject) => {
          fail = reject
        })
    )
    const page = await render(CLAIM)
    expect(resolve).toHaveBeenCalledTimes(1)

    await press(page, 'Cancel')
    await act(async () => {
      fail(new Error('the records did not answer'))
      await flush(20)
    })
    expect(store.set).toHaveBeenCalledTimes(1)
    expect(reported(store)).toMatchObject({ kind: 'dismissed', note: 'cancelled' })
    expect(carries(reported(store), { strings: ['service-unanswered'] })).toBe(false)
    expect(creds.get).not.toHaveBeenCalled()
    expect(page.textContent).toContain('Cancelled')
    expect(page.textContent).not.toContain('Could not run')
  })

  it('prompts nothing and writes the cancelled report when the resolve then answers', async () => {
    const creds = answeringBrowser()
    setVisibility('visible', false)
    const { store, resolve, method, orchestrator } = source()
    const answer = resolve.getMockImplementation()
    let release: () => void = () => undefined
    const released = new Promise<void>((done) => {
      release = done
    })
    resolve.mockImplementation(async () => {
      await released
      if (!answer) {
        throw new Error('the source has no resolve')
      }
      return answer()
    })
    const page = await render(CLAIM)

    await press(page, 'Cancel')
    await act(async () => {
      release()
      await flush(20)
    })
    expect(creds.get).not.toHaveBeenCalled()
    expect(methodRunCount(method, orchestrator)).toBe(0)
    expect(store.set).toHaveBeenCalledTimes(1)
    expect(reported(store)).toMatchObject({ kind: 'dismissed', note: 'cancelled' })
  })
})

/** A browser that answers the claim's prompt and keeps the abort signal it was given. */
const signalKeepingBrowser = () => {
  const seen: { signal?: AbortSignal } = {}
  browser = installCredentials({
    get: async (options) => {
      seen.signal = options?.signal
      return fakeAssertion({ r: BigInt(5), s: BigInt(6) }).credential
    }
  })
  return { creds: browser, seen }
}

/** Holds the method's reply until the test calls the returned release. */
const holdReply = (method: ReturnType<typeof source>['method']) => {
  let finish: (proof: typeof PROOF_HEX) => void = () => undefined
  method.replyFrom.mockImplementation(
    () =>
      new Promise<typeof PROOF_HEX>((resolve) => {
        finish = resolve
      })
  )
  return async () =>
    act(async () => {
      finish(PROOF_HEX)
      await flush(20)
    })
}

describe('a store handed to the tab while the method runs', () => {
  /** Runs a claim whose method answers only after the tab received a new store. */
  const claimAcrossAStoreSwap = async () => {
    setVisibility('visible', false)
    const { creds, seen } = signalKeepingBrowser()
    const { method, store } = source()
    const release = holdReply(method)
    const page = await render(CLAIM)
    expect(method.replyFrom).toHaveBeenCalledTimes(1)

    const next = fakeStore()
    await swapSource({ ...mockSource.current, store: next })
    const abortedBySwap = seen.signal?.aborted
    await release()
    return { creds, store, next, page, abortedBySwap }
  }

  it('lets the ceremony finish and report passed, not cancelled, with one report', async () => {
    const { creds, store, next, page, abortedBySwap } = await claimAcrossAStoreSwap()
    expect(abortedBySwap).toBe(false)
    expect(page.textContent).toContain('passed just now')
    expect(page.textContent).not.toContain('Cancelled')
    expect(creds.get).toHaveBeenCalledTimes(1)
    const written = [...store.set.mock.calls, ...next.set.mock.calls]
    expect(written).toHaveLength(1)
    expect((written[0][1] as { outcome: unknown }).outcome).toMatchObject({
      kind: 'verdict',
      verdict: 'passed'
    })
  })

  it('writes the report through the new store, not the one it replaced', async () => {
    const { store, next } = await claimAcrossAStoreSwap()
    expect(store.set).not.toHaveBeenCalled()
    expect(next.set).toHaveBeenCalledTimes(1)
  })
})

describe('the tab inside React StrictMode', () => {
  it('starts the ceremony once and writes one report', async () => {
    setVisibility('visible', false)
    const creds = answeringBrowser()
    const { store, resolve } = source()
    const page = await render(CLAIM, { strict: true })
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(creds.get).toHaveBeenCalledTimes(1)
    expect(store.set).toHaveBeenCalledTimes(1)
    expect(reported(store)).toMatchObject({ kind: 'verdict', verdict: 'passed' })
    expect(page.textContent).toContain('passed just now')
  })
})

describe('a tab closed while the method runs', () => {
  it('aborts the ceremony and writes nothing', async () => {
    setVisibility('visible', false)
    const { seen } = signalKeepingBrowser()
    const { method, store } = source()
    const release = holdReply(method)
    await render(CLAIM)
    expect(method.replyFrom).toHaveBeenCalledTimes(1)
    expect(seen.signal?.aborted).toBe(false)

    await act(async () => root?.unmount())
    root = null
    expect(seen.signal?.aborted).toBe(true)

    await release()
    expect(store.set).not.toHaveBeenCalled()
  })
})
