/**
 * @jest-environment jsdom
 *
 * The setup tab's account hook, read by small probes over the tab's real
 * session storage. The wallet's selected account is an external store, so a
 * test can change it the way the background's state push does. jsdom has no
 * `TextEncoder`, which viem reads when it loads, so the test sets Node's before
 * it loads the modules.
 */
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { TextDecoder, TextEncoder } from 'util'

import type { Location, NavigateFunction } from 'react-router-dom'

import type { Address } from '@web/modules/social-recovery/sdk-interfaces'
import type { SetupAccount } from '@web/modules/social-recovery/shared/chrome'

import type {
  HistoryListener,
  HistoryTarget,
  RouterHistory,
  WatchedHistory
} from '@web/modules/social-recovery/shared/chrome/__fixtures__/types'
import { eachIt } from '@web/modules/social-recovery/shared/chrome/__fixtures__/table'

Object.assign(globalThis, { TextEncoder, TextDecoder })
// React only runs effects and state updates inside act() when this flag is set.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockSelected: {
  state: { account: { addr: string } | null }
  listeners: Set<() => void>
} = { state: { account: null }, listeners: new Set() }

// A fresh page loads the hook's module again; React and the router stay the
// ones the test renders with, so the reloaded hook reads the same router.
jest.mock('react', () => {
  const shared = globalThis as { mockSharedReact?: unknown }
  shared.mockSharedReact = shared.mockSharedReact ?? jest.requireActual('react')
  return shared.mockSharedReact
})
jest.mock('react-router-dom', () => {
  const shared = globalThis as { mockSharedRouter?: unknown }
  shared.mockSharedRouter = shared.mockSharedRouter ?? jest.requireActual('react-router-dom')
  return shared.mockSharedRouter
})

jest.mock('@web/hooks/useSelectedAccountControllerState', () => ({
  __esModule: true,
  default: () =>
    // eslint-disable-next-line global-require
    require('react').useSyncExternalStore(
      (listener: () => void) => {
        mockSelected.listeners.add(listener)
        return () => mockSelected.listeners.delete(listener)
      },
      () => mockSelected.state
    )
}))

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const {
  MemoryRouter,
  NavigationType,
  unstable_HistoryRouter: HistoryRouter,
  useLocation,
  useNavigate
}: typeof import('react-router-dom') = require('react-router-dom')
const useSetupAccount: typeof import('@web/modules/social-recovery/shared/chrome/useSetupAccount').default =
  require('@web/modules/social-recovery/shared/chrome/useSetupAccount').default
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

// The hook the probes read; a fresh page swaps in a newly loaded copy.
let useHook = useSetupAccount

// A real reload of the page: the hook's module loads again with nothing kept in
// memory, so only the tab's session storage carries over.
const freshPage = () => {
  jest.isolateModules(() => {
    // eslint-disable-next-line global-require
    useHook = require('@web/modules/social-recovery/shared/chrome/useSetupAccount').default
  })
}

const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'
const OTHER_ACCOUNT: Address = '0x2222222222222222222222222222222222222222'
const THIRD_ACCOUNT: Address = '0x3333333333333333333333333333333333333333'

// Each probe keeps the last value its hook returned, and the account of every render.
const reads: Record<string, SetupAccount> = {}
const rendered: Record<string, (Address | undefined)[]> = {}
const Probe = ({ name }: { name: string }) => {
  reads[name] = useHook()
  rendered[name] = [...(rendered[name] ?? []), reads[name].account]
  return null
}

// The router's navigate, kept so a test can move the tab the way a link or Back
// does, and the location the router stands on.
let navigate: NavigateFunction
let current: Location
const Navigator = () => {
  navigate = useNavigate()
  current = useLocation()
  return null
}

let container: HTMLDivElement
let root: Root

const select = (addr: string | null) =>
  act(() => {
    mockSelected.state = { account: addr === null ? null : { addr } }
    mockSelected.listeners.forEach((listener) => listener())
  })

// The probes stand on a setup step reached from another setup step.
const INSIDE_THE_SETUP = {
  pathname: '/social-recovery/setup/editor',
  key: 'opened',
  state: { prevRoute: { pathname: '/social-recovery/setup' } }
}

const open = (...names: string[]) =>
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[INSIDE_THE_SETUP]}>
        {names.map((name) => (
          <Probe key={name} name={name} />
        ))}
      </MemoryRouter>
    )
  })

// A reload of the tab: the page goes and comes back over the same session storage,
// with nothing kept in the module's memory.
const reload = (...names: string[]) => {
  act(() => root.unmount())
  root = createRoot(container)
  freshPage()
  open(...names)
}

const switchToSelected = (name: string) =>
  act(() => {
    reads[name].switchToSelected()
  })

beforeEach(() => {
  useHook = useSetupAccount
  sessionStorage.clear()
  Object.keys(reads).forEach((name) => delete reads[name])
  Object.keys(rendered).forEach((name) => delete rendered[name])
  mockSelected.state = { account: null }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  jest.restoreAllMocks()
})

describe("the setup tab's account", () => {
  beforeEach(() => {
    freshPage()
  })

  it('works on the selected account when the tab opens, with no difference', () => {
    mockSelected.state = { account: { addr: ACCOUNT } }
    open('screen')
    expect(reads.screen.account).toBe(ACCOUNT)
    expect(reads.screen.differs).toBe(false)
    expect(reads.screen.selected).toBeUndefined()
  })

  it('has no account while the wallet selects none', () => {
    open('screen')
    expect(reads.screen.account).toBeUndefined()
    expect(reads.screen.differs).toBe(false)
  })

  it('keeps the first account when the wallet selects another, and reports the other one', () => {
    mockSelected.state = { account: { addr: ACCOUNT } }
    open('screen')
    select(OTHER_ACCOUNT)
    expect(reads.screen.account).toBe(ACCOUNT)
    expect(reads.screen.differs).toBe(true)
    expect(reads.screen.selected).toBe(OTHER_ACCOUNT)
    select(THIRD_ACCOUNT)
    expect(reads.screen.account).toBe(ACCOUNT)
    expect(reads.screen.selected).toBe(THIRD_ACCOUNT)
  })

  it('reports no difference once the wallet selects the first account again', () => {
    mockSelected.state = { account: { addr: ACCOUNT } }
    open('screen')
    select(OTHER_ACCOUNT)
    select(ACCOUNT)
    expect(reads.screen.account).toBe(ACCOUNT)
    expect(reads.screen.differs).toBe(false)
    expect(reads.screen.selected).toBeUndefined()
  })

  it('keeps the first account while the wallet selects none', () => {
    mockSelected.state = { account: { addr: ACCOUNT } }
    open('screen')
    select(null)
    expect(reads.screen.account).toBe(ACCOUNT)
    expect(reads.screen.differs).toBe(false)
  })

  it('takes the account the wallet selects when the tab opened with none selected', () => {
    open('screen')
    select(ACCOUNT)
    expect(reads.screen.account).toBe(ACCOUNT)
    select(OTHER_ACCOUNT)
    expect(reads.screen.account).toBe(ACCOUNT)
    expect(reads.screen.differs).toBe(true)
  })

  it('keeps the first account across a reload of the tab', () => {
    mockSelected.state = { account: { addr: ACCOUNT } }
    open('screen')
    select(OTHER_ACCOUNT)
    reload('screen')
    expect(reads.screen.account).toBe(ACCOUNT)
    expect(reads.screen.differs).toBe(true)
    expect(reads.screen.selected).toBe(OTHER_ACCOUNT)
  })

  it('switches to the selected account, keeps it from then on, and reports no difference', () => {
    mockSelected.state = { account: { addr: ACCOUNT } }
    open('screen')
    select(OTHER_ACCOUNT)
    switchToSelected('screen')
    expect(reads.screen.account).toBe(OTHER_ACCOUNT)
    expect(reads.screen.differs).toBe(false)
    expect(reads.screen.selected).toBeUndefined()
    select(ACCOUNT)
    expect(reads.screen.account).toBe(OTHER_ACCOUNT)
    expect(reads.screen.differs).toBe(true)
    reload('screen')
    expect(reads.screen.account).toBe(OTHER_ACCOUNT)
  })

  it('switches every reader in the tab at once', () => {
    mockSelected.state = { account: { addr: ACCOUNT } }
    open('chrome', 'screen')
    select(OTHER_ACCOUNT)
    expect(reads.chrome.account).toBe(ACCOUNT)
    expect(reads.screen.account).toBe(ACCOUNT)
    switchToSelected('chrome')
    expect(reads.chrome.account).toBe(OTHER_ACCOUNT)
    expect(reads.screen.account).toBe(OTHER_ACCOUNT)
    expect(reads.screen.differs).toBe(false)
  })

  it('ignores a stored account that is not an address and takes the selected one', () => {
    mockSelected.state = { account: { addr: ACCOUNT } }
    open('screen')
    // Whatever entry the tab keeps its account under now holds something else.
    const keys = Object.keys(sessionStorage).filter(
      (key) => sessionStorage.getItem(key) === ACCOUNT
    )
    expect(keys).toHaveLength(1)
    sessionStorage.setItem(keys[0], 'not-an-address')
    act(() => root.unmount())
    root = createRoot(container)
    mockSelected.state = { account: { addr: OTHER_ACCOUNT } }
    open('screen')
    expect(reads.screen.account).toBe(OTHER_ACCOUNT)
    expect(reads.screen.differs).toBe(false)
    // The selected account is kept from then on.
    select(THIRD_ACCOUNT)
    expect(reads.screen.account).toBe(OTHER_ACCOUNT)
  })

  it('ignores a selected account that is not an address', () => {
    mockSelected.state = { account: { addr: 'not-an-address' } }
    open('screen')
    expect(reads.screen.account).toBeUndefined()
    expect(reads.screen.differs).toBe(false)
    select(ACCOUNT)
    expect(reads.screen.account).toBe(ACCOUNT)
  })

  it('follows the selected account when the session storage throws on every call', () => {
    const refuse = () => {
      throw new Error('storage refused')
    }
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(refuse)
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(refuse)
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(refuse)
    mockSelected.state = { account: { addr: ACCOUNT } }
    open('screen')
    expect(reads.screen.account).toBe(ACCOUNT)
    expect(reads.screen.differs).toBe(false)
    select(OTHER_ACCOUNT)
    expect(reads.screen.account).toBe(OTHER_ACCOUNT)
    expect(reads.screen.differs).toBe(false)
    switchToSelected('screen')
    expect(reads.screen.account).toBe(OTHER_ACCOUNT)
  })

  it('follows the selected account when the tab has no session storage to reach', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'sessionStorage')
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get: () => {
        throw new Error('storage blocked')
      }
    })
    try {
      mockSelected.state = { account: { addr: ACCOUNT } }
      open('screen')
      expect(reads.screen.account).toBe(ACCOUNT)
      select(OTHER_ACCOUNT)
      expect(reads.screen.account).toBe(OTHER_ACCOUNT)
      expect(reads.screen.differs).toBe(false)
    } finally {
      if (original) {
        Object.defineProperty(window, 'sessionStorage', original)
      }
    }
  })
})

// A history entry the router starts on, with its own key and route state.
const entry = (key: string, state?: unknown): Partial<Location> => ({
  pathname: '/social-recovery/setup',
  key,
  state
})

// The page comes up on the given history entry; every mount builds a new router,
// so no location carries over from an earlier mount.
const mountOn = (at: Partial<Location>, ...names: string[]) => {
  act(() => root.unmount())
  root = createRoot(container)
  Object.keys(rendered).forEach((name) => delete rendered[name])
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[at]}>
        <Navigator />
        {names.map((name) => (
          <Probe key={name} name={name} />
        ))}
      </MemoryRouter>
    )
  })
}

const go = (to: string | number, state?: unknown) =>
  act(() => {
    if (typeof to === 'number') {
      navigate(to)
    } else {
      navigate(to, { state })
    }
  })

// The one session storage entry that holds a list, which is how the tab keeps the visit.
const storedListKey = () => {
  const keys = Object.keys(sessionStorage).filter((key) => {
    try {
      return Array.isArray(JSON.parse(sessionStorage.getItem(key) ?? ''))
    } catch {
      return false
    }
  })
  expect(keys).toHaveLength(1)
  return keys[0]
}

const FROM_THE_DASHBOARD = { prevRoute: { pathname: '/dashboard' } }

describe('a visit of the setup', () => {
  beforeEach(() => {
    freshPage()
  })

  // An earlier visit latched the first account; the wallet now selects the other one.
  const afterAnEarlierVisit = () => {
    mockSelected.state = { account: { addr: ACCOUNT } }
    open('screen')
    expect(reads.screen.account).toBe(ACCOUNT)
    mockSelected.state = { account: { addr: OTHER_ACCOUNT } }
    // The earlier visit left no location a new entry could follow.
    sessionStorage.removeItem(storedListKey())
  }

  eachIt([
    ['no route state', undefined],
    ['a route state with no previous route', {}],
    ['a previous route that is not a string', { prevRoute: { pathname: 7 } }],
    ['the dashboard as the previous route', FROM_THE_DASHBOARD],
    [
      'another recovery route as the previous route',
      { prevRoute: { pathname: '/social-recovery/manage' } }
    ],
    [
      'a route that only starts like the setup',
      { prevRoute: { pathname: '/social-recovery/setupx' } }
    ]
  ])(
    'starts on the selected account after an arrival with %s, over an earlier latch',
    (_, state) => {
      afterAnEarlierVisit()
      mountOn(entry('arrival', state), 'screen')
      expect(rendered.screen).not.toContain(ACCOUNT)
      expect(reads.screen.account).toBe(OTHER_ACCOUNT)
      expect(reads.screen.differs).toBe(false)
      // The new visit keeps its account from then on.
      select(THIRD_ACCOUNT)
      expect(reads.screen.account).toBe(OTHER_ACCOUNT)
      expect(reads.screen.differs).toBe(true)
      expect(reads.screen.selected).toBe(THIRD_ACCOUNT)
    }
  )

  it('keeps the earlier latch when the page comes up inside the setup', () => {
    afterAnEarlierVisit()
    mountOn(entry('inside', { prevRoute: { pathname: '/social-recovery/setup/editor' } }), 'screen')
    expect(rendered.screen).not.toContain(OTHER_ACCOUNT)
    expect(reads.screen.account).toBe(ACCOUNT)
    expect(reads.screen.differs).toBe(true)
  })

  it('keeps the account across the navigation inside the setup while the wallet selects another', () => {
    mockSelected.state = { account: { addr: ACCOUNT } }
    mountOn(entry('arrival', FROM_THE_DASHBOARD), 'screen')
    select(OTHER_ACCOUNT)
    go('/social-recovery/setup/editor', { prevRoute: { pathname: '/social-recovery/setup' } })
    expect(reads.screen.account).toBe(ACCOUNT)
    expect(reads.screen.differs).toBe(true)
    go('/social-recovery/setup/enroll', {
      prevRoute: { pathname: '/social-recovery/setup/editor' }
    })
    expect(rendered.screen).not.toContain(OTHER_ACCOUNT)
    expect(reads.screen.account).toBe(ACCOUNT)
    expect(reads.screen.selected).toBe(OTHER_ACCOUNT)
  })

  eachIt([
    ['a previous route outside the setup', FROM_THE_DASHBOARD],
    ['no route state', undefined]
  ])('keeps the account across a reload of the arrival entry with %s', (_, state) => {
    mockSelected.state = { account: { addr: ACCOUNT } }
    mountOn(entry('arrival', state), 'screen')
    select(OTHER_ACCOUNT)
    freshPage()
    mountOn(entry('arrival', state), 'screen')
    expect(rendered.screen).not.toContain(OTHER_ACCOUNT)
    expect(reads.screen.account).toBe(ACCOUNT)
    expect(reads.screen.differs).toBe(true)
    // A second reload decides the same way.
    freshPage()
    mountOn(entry('arrival', state), 'screen')
    expect(reads.screen.account).toBe(ACCOUNT)
  })

  it('keeps the switched account across a reload of the arrival entry', () => {
    mockSelected.state = { account: { addr: ACCOUNT } }
    mountOn(entry('arrival', FROM_THE_DASHBOARD), 'screen')
    select(OTHER_ACCOUNT)
    switchToSelected('screen')
    select(ACCOUNT)
    freshPage()
    mountOn(entry('arrival', FROM_THE_DASHBOARD), 'screen')
    expect(reads.screen.account).toBe(OTHER_ACCOUNT)
    expect(reads.screen.differs).toBe(true)
  })

  it('starts a new visit when a later arrival has another entry key', () => {
    mockSelected.state = { account: { addr: ACCOUNT } }
    mountOn(entry('arrival', FROM_THE_DASHBOARD), 'screen')
    select(OTHER_ACCOUNT)
    mountOn(entry('later-arrival', FROM_THE_DASHBOARD), 'screen')
    expect(reads.screen.account).toBe(OTHER_ACCOUNT)
    expect(reads.screen.differs).toBe(false)
  })

  it('keeps the account when Back returns from a setup step to the arrival entry', () => {
    mockSelected.state = { account: { addr: ACCOUNT } }
    mountOn(entry('arrival', FROM_THE_DASHBOARD), 'screen')
    select(OTHER_ACCOUNT)
    go('/social-recovery/setup/editor', { prevRoute: { pathname: '/social-recovery/setup' } })
    expect(reads.screen.account).toBe(ACCOUNT)
    go(-1)
    expect(reads.screen.account).toBe(ACCOUNT)
    expect(reads.screen.differs).toBe(true)
  })

  it('keeps the account when a passkey ceremony in the same tab returns to the enroll step', () => {
    mockSelected.state = { account: { addr: ACCOUNT } }
    mountOn(entry('arrival', FROM_THE_DASHBOARD), 'screen')
    select(OTHER_ACCOUNT)
    go('/social-recovery/setup/enroll', { prevRoute: { pathname: '/social-recovery/setup' } })
    // The enroll step opens the ceremony with a push from the step.
    go('/social-recovery/ceremony', {
      prevRoute: { pathname: '/social-recovery/setup/enroll' }
    })
    // The ceremony replaces its own entry with the step's route and no route state.
    act(() => {
      navigate('/social-recovery/setup/enroll', { replace: true })
    })
    expect(reads.screen.account).toBe(ACCOUNT)
    expect(reads.screen.differs).toBe(true)
  })

  it('gives the chrome and the screen the same account on every render of one arrival', () => {
    afterAnEarlierVisit()
    mountOn(entry('arrival', FROM_THE_DASHBOARD), 'chrome', 'screen')
    expect(rendered.chrome.length).toBeGreaterThan(0)
    expect(rendered.chrome).toEqual(rendered.screen)
    expect(rendered.screen.every((account) => account === OTHER_ACCOUNT)).toBe(true)
    select(THIRD_ACCOUNT)
    expect(reads.chrome.account).toBe(OTHER_ACCOUNT)
    expect(reads.screen.account).toBe(OTHER_ACCOUNT)
    expect(reads.chrome.differs).toBe(true)
    expect(reads.screen.differs).toBe(true)
  })

  it("gives a reader that mounts later on the same arrival the visit's account", () => {
    afterAnEarlierVisit()
    mountOn(entry('arrival', FROM_THE_DASHBOARD), 'chrome')
    select(THIRD_ACCOUNT)
    // The same router stays mounted, so the location does not change.
    act(() => {
      root.render(
        <MemoryRouter initialEntries={[entry('arrival', FROM_THE_DASHBOARD)]}>
          <Navigator />
          <Probe name="chrome" />
          <Probe name="screen" />
        </MemoryRouter>
      )
    })
    expect(rendered.screen).not.toContain(THIRD_ACCOUNT)
    expect(reads.screen.account).toBe(OTHER_ACCOUNT)
    expect(reads.chrome.account).toBe(OTHER_ACCOUNT)
  })
})

// An entry the router did not push: a typed URL, or the wallet opening the
// setup in its reused tab. The router gives the page's first entry that key.
const UNPUSHED: Partial<Location> = { pathname: '/social-recovery/setup' }

// The tab's history stands on the given entries; every mount builds a new router.
const mountOnHistory = (entries: Partial<Location>[], index: number, ...names: string[]) => {
  act(() => root.unmount())
  root = createRoot(container)
  act(() => {
    root.render(
      <MemoryRouter initialEntries={entries} initialIndex={index}>
        <Navigator />
        {names.map((name) => (
          <Probe key={name} name={name} />
        ))}
      </MemoryRouter>
    )
  })
}

describe('the locations of a setup visit', () => {
  beforeEach(() => {
    freshPage()
  })

  // The holder arrives from the dashboard on the first account, and the wallet
  // then selects the other one.
  const arriveThenSelectOther = () => {
    mockSelected.state = { account: { addr: ACCOUNT } }
    mountOn(entry('arrival', FROM_THE_DASHBOARD), 'screen')
    expect(reads.screen.account).toBe(ACCOUNT)
    select(OTHER_ACCOUNT)
  }

  eachIt([
    ['in the same page', () => {}],
    ['after the page loads again', () => freshPage()]
  ])(
    'starts on the selected account when a typed URL opens the setup over a live visit, %s',
    (_, between) => {
      arriveThenSelectOther()
      go('/social-recovery/setup/editor', { prevRoute: { pathname: '/social-recovery/setup' } })
      expect(reads.screen.account).toBe(ACCOUNT)
      between()
      mountOn(UNPUSHED, 'screen')
      expect(current.key).not.toBe('default')
      expect(rendered.screen).not.toContain(ACCOUNT)
      expect(reads.screen.account).toBe(OTHER_ACCOUNT)
      expect(reads.screen.differs).toBe(false)
      select(THIRD_ACCOUNT)
      expect(reads.screen.account).toBe(OTHER_ACCOUNT)
    }
  )

  it('starts on the selected account when an unpushed entry loads again after the selection changed', () => {
    mockSelected.state = { account: { addr: ACCOUNT } }
    mountOn(UNPUSHED, 'screen')
    expect(reads.screen.account).toBe(ACCOUNT)
    select(OTHER_ACCOUNT)
    freshPage()
    mountOn(UNPUSHED, 'screen')
    expect(reads.screen.account).toBe(OTHER_ACCOUNT)
    expect(reads.screen.differs).toBe(false)
  })

  it('keeps the account when the page loads again on a pushed entry whose previous route is outside the setup', () => {
    arriveThenSelectOther()
    freshPage()
    mountOn(entry('arrival', FROM_THE_DASHBOARD), 'screen')
    expect(rendered.screen).not.toContain(OTHER_ACCOUNT)
    expect(reads.screen.account).toBe(ACCOUNT)
    expect(reads.screen.differs).toBe(true)
    expect(reads.screen.selected).toBe(OTHER_ACCOUNT)
  })

  it('keeps the account when the page loads again on a pushed setup step, and on Back from it', () => {
    arriveThenSelectOther()
    go('/social-recovery/setup/editor', { prevRoute: { pathname: '/social-recovery/setup' } })
    const editor = current
    freshPage()
    mountOnHistory([entry('arrival', FROM_THE_DASHBOARD), editor], 1, 'screen')
    expect(current.key).toBe(editor.key)
    expect(reads.screen.account).toBe(ACCOUNT)
    go(-1)
    expect(current.key).toBe('arrival')
    expect(rendered.screen).not.toContain(OTHER_ACCOUNT)
    expect(reads.screen.account).toBe(ACCOUNT)
    expect(reads.screen.differs).toBe(true)
  })

  it('keeps the account on Forward after Back', () => {
    arriveThenSelectOther()
    go('/social-recovery/setup/editor', { prevRoute: { pathname: '/social-recovery/setup' } })
    const second = current.key
    go('/social-recovery/setup/enroll', {
      prevRoute: { pathname: '/social-recovery/setup/editor' }
    })
    const third = current.key
    go(-1)
    expect(current.key).toBe(second)
    expect(reads.screen.account).toBe(ACCOUNT)
    go(1)
    expect(current.key).toBe(third)
    expect(reads.screen.account).toBe(ACCOUNT)
    // Back to the arrival entry, then Forward over the steps again.
    go(-2)
    expect(current.key).toBe('arrival')
    go(1)
    go(1)
    expect(current.key).toBe(third)
    expect(rendered.screen).not.toContain(OTHER_ACCOUNT)
    expect(reads.screen.account).toBe(ACCOUNT)
    expect(reads.screen.differs).toBe(true)
  })

  eachIt([
    ['the enroll step', [] as string[]],
    ['the ceremony', ['/social-recovery/ceremony']]
  ])(
    'keeps the account when a new entry with no route state follows %s as the last location',
    (_, ceremony) => {
      arriveThenSelectOther()
      go('/social-recovery/setup/enroll', { prevRoute: { pathname: '/social-recovery/setup' } })
      ceremony.forEach((pathname) =>
        go(pathname, { prevRoute: { pathname: '/social-recovery/setup/enroll' } })
      )
      // The page loads again, so only the visit's stored locations can decide.
      freshPage()
      mountOn({ pathname: '/social-recovery/setup/enroll', key: 'ceremony-return' }, 'screen')
      expect(rendered.screen).not.toContain(OTHER_ACCOUNT)
      expect(reads.screen.account).toBe(ACCOUNT)
      expect(reads.screen.differs).toBe(true)
    }
  )

  it('starts on the selected account when a new entry with no route state comes after no visited location', () => {
    mockSelected.state = { account: { addr: ACCOUNT } }
    mountOn(UNPUSHED, 'screen')
    select(OTHER_ACCOUNT)
    // The visit's stored locations are gone.
    sessionStorage.removeItem(storedListKey())
    freshPage()
    mountOn({ pathname: '/social-recovery/setup/enroll', key: 'new' }, 'screen')
    expect(rendered.screen).not.toContain(ACCOUNT)
    expect(reads.screen.account).toBe(OTHER_ACCOUNT)
    expect(reads.screen.differs).toBe(false)
  })

  it('starts on the selected account in a fresh tab on a new entry with no route state', () => {
    mockSelected.state = { account: { addr: OTHER_ACCOUNT } }
    mountOn({ pathname: '/social-recovery/setup/enroll', key: 'new' }, 'screen')
    expect(reads.screen.account).toBe(OTHER_ACCOUNT)
    select(ACCOUNT)
    expect(reads.screen.account).toBe(OTHER_ACCOUNT)
    expect(reads.screen.differs).toBe(true)
  })

  // The visit starts on the arrival entry and pushes setup steps until it has
  // visited the given number of locations, then goes Back to the first one.
  const visitThenBackToFirst = (locations: number) => {
    arriveThenSelectOther()
    for (let n = 1; n < locations; n += 1) {
      go(`/social-recovery/setup/step-${n}`, {
        prevRoute: {
          pathname: n === 1 ? '/social-recovery/setup' : `/social-recovery/setup/step-${n - 1}`
        }
      })
    }
    expect(reads.screen.account).toBe(ACCOUNT)
    go(-(locations - 1))
    expect(current.key).toBe('arrival')
  }

  it('keeps the account on Back to the first of fifty visited locations', () => {
    visitThenBackToFirst(50)
    expect(reads.screen.account).toBe(ACCOUNT)
    expect(reads.screen.differs).toBe(true)
  })

  it('forgets the first location after fifty-two, which then decides by its route state', () => {
    visitThenBackToFirst(52)
    // Its previous route is the dashboard, so it starts a new visit.
    expect(reads.screen.account).toBe(OTHER_ACCOUNT)
    expect(reads.screen.differs).toBe(false)
  })

  eachIt([
    ['not JSON', '{not json'],
    ['not a list', JSON.stringify({ key: 'arrival', pathname: '/social-recovery/setup' })],
    ['a list of entries with no path', JSON.stringify([{ key: 'arrival' }])],
    [
      'a list of entries whose key is not text',
      JSON.stringify([{ key: 7, pathname: '/social-recovery/setup' }])
    ],
    ['a list of plain values', JSON.stringify(['arrival', null, 3])]
  ])('ignores a stored visit that is %s', (_, malformed) => {
    arriveThenSelectOther()
    sessionStorage.setItem(storedListKey(), malformed)
    freshPage()
    mountOn(entry('arrival', FROM_THE_DASHBOARD), 'screen')
    // The entry is no longer known, so its previous route outside the setup decides.
    expect(reads.screen.account).toBe(OTHER_ACCOUNT)
    expect(reads.screen.differs).toBe(false)
    // The new visit is stored again, so a further load of the page keeps its account.
    select(ACCOUNT)
    freshPage()
    mountOn(entry('arrival', FROM_THE_DASHBOARD), 'screen')
    expect(reads.screen.account).toBe(OTHER_ACCOUNT)
    expect(reads.screen.differs).toBe(true)
  })
})

// A tab history in memory, like the router's own: the first entry with no key of
// its own gets the key of an entry the router did not push.
const memoryHistory = (initial: Partial<Location>[], start: number) => {
  let created = 0
  const toLocation = (to: HistoryTarget, state: unknown, key?: string): Location => {
    created += 1
    const path = typeof to === 'string' ? { pathname: to } : to
    return {
      pathname: path.pathname ?? '/',
      search: path.search ?? '',
      hash: path.hash ?? '',
      state: state ?? null,
      key: key ?? `entry-${created}`
    }
  }
  const entries = initial.map((at, n) =>
    toLocation(at, at.state, at.key ?? (n === 0 ? 'default' : undefined))
  )
  let index = start
  let action: RouterHistory['action'] = NavigationType.Pop
  let listener: HistoryListener | null = null
  const notify = (delta: number) => listener?.({ action, location: entries[index], delta })
  const history: WatchedHistory['history'] = {
    get index() {
      return index
    },
    get action() {
      return action
    },
    get location() {
      return entries[index]
    },
    createHref: (to) => (typeof to === 'string' ? to : `${to.pathname ?? ''}${to.search ?? ''}`),
    createURL: (to) => new URL(typeof to === 'string' ? to : to.pathname ?? '/', 'http://tab'),
    encodeLocation: (to) => ({
      pathname: typeof to === 'string' ? to : to.pathname ?? '',
      search: typeof to === 'string' ? '' : to.search ?? '',
      hash: typeof to === 'string' ? '' : to.hash ?? ''
    }),
    push: (to, state) => {
      action = NavigationType.Push
      index += 1
      entries.splice(index, entries.length, toLocation(to, state))
      notify(1)
    },
    replace: (to, state) => {
      action = NavigationType.Replace
      entries[index] = toLocation(to, state)
      notify(0)
    },
    go: (delta) => {
      action = NavigationType.Pop
      index = Math.min(Math.max(index + delta, 0), entries.length - 1)
      notify(delta)
    },
    listen: (next) => {
      listener = next
      return () => {
        listener = null
      }
    }
  }
  return history
}

// The tab's history stands on the given entries, and the page renders over it.
const mountOnWatchedHistory = (
  entries: Partial<Location>[],
  index: number,
  ...names: string[]
): WatchedHistory => {
  act(() => root.unmount())
  root = createRoot(container)
  Object.keys(rendered).forEach((name) => delete rendered[name])
  const history = memoryHistory(entries, index)
  const pushes = jest.spyOn(history, 'push')
  const replaces = jest.spyOn(history, 'replace')
  act(() => {
    root.render(
      <HistoryRouter history={history}>
        <Navigator />
        {names.map((name) => (
          <Probe key={name} name={name} />
        ))}
      </HistoryRouter>
    )
  })
  return { history, pushes, replaces }
}

// A later entry the tab can go Forward to, so a push over the first entry shows.
const LATER_ENTRY: Partial<Location> = {
  pathname: '/dashboard',
  key: 'later'
}

describe('an entry the router did not push', () => {
  beforeEach(() => {
    freshPage()
  })

  eachIt([
    ['an unpushed entry', UNPUSHED],
    ['a pushed entry from the dashboard', entry('arrival', FROM_THE_DASHBOARD)]
  ])(
    'starts on the selected account when a second unpushed entry opens the setup in the same page, over a visit that began on %s',
    (_, first) => {
      mockSelected.state = { account: { addr: ACCOUNT } }
      mountOn(first, 'screen')
      expect(reads.screen.account).toBe(ACCOUNT)
      select(OTHER_ACCOUNT)
      expect(reads.screen.account).toBe(ACCOUNT)
      mountOn(UNPUSHED, 'screen')
      expect(rendered.screen).not.toContain(ACCOUNT)
      expect(reads.screen.account).toBe(OTHER_ACCOUNT)
      expect(reads.screen.differs).toBe(false)
      select(THIRD_ACCOUNT)
      expect(reads.screen.account).toBe(OTHER_ACCOUNT)
      expect(reads.screen.differs).toBe(true)
    }
  )

  eachIt([
    ['no route state', undefined],
    ['a previous route outside the setup', FROM_THE_DASHBOARD]
  ])(
    'replaces the unpushed entry in place with a keyed entry for the same URL and %s',
    (_, state) => {
      mockSelected.state = { account: { addr: ACCOUNT } }
      const { history, pushes, replaces } = mountOnWatchedHistory(
        [
          { pathname: '/social-recovery/setup', search: '?from=wallet', hash: '#top', state },
          LATER_ENTRY
        ],
        0,
        'screen'
      )
      expect(current.key).not.toBe('default')
      expect(current.pathname).toBe('/social-recovery/setup')
      expect(current.search).toBe('?from=wallet')
      expect(current.hash).toBe('#top')
      expect(current.state).toEqual(state ?? null)
      expect(pushes).not.toHaveBeenCalled()
      expect(replaces).toHaveBeenCalledTimes(1)
      expect(history.index).toBe(0)
      // The later entry is still there, so the history did not grow over it.
      go(1)
      expect(current.key).toBe('later')
    }
  )

  eachIt([
    ['no route state', undefined],
    ['a previous route outside the setup', FROM_THE_DASHBOARD]
  ])(
    'keeps the account on Back from a setup step to the keyed entry that replaced an unpushed one with %s',
    (_, state) => {
      mockSelected.state = { account: { addr: ACCOUNT } }
      mountOn({ ...UNPUSHED, state }, 'screen')
      const keyed = current
      expect(keyed.key).not.toBe('default')
      select(OTHER_ACCOUNT)
      go('/social-recovery/setup/editor', { prevRoute: { pathname: '/social-recovery/setup' } })
      expect(reads.screen.account).toBe(ACCOUNT)
      go(-1)
      expect(current.key).toBe(keyed.key)
      expect(rendered.screen).not.toContain(OTHER_ACCOUNT)
      expect(reads.screen.account).toBe(ACCOUNT)
      expect(reads.screen.differs).toBe(true)
      expect(reads.screen.selected).toBe(OTHER_ACCOUNT)
    }
  )

  eachIt([
    ['no route state', undefined],
    ['a previous route outside the setup', FROM_THE_DASHBOARD]
  ])(
    'keeps the account when the page loads again on the keyed entry that replaced an unpushed one with %s',
    (_, state) => {
      mockSelected.state = { account: { addr: ACCOUNT } }
      mountOn({ ...UNPUSHED, state }, 'screen')
      const keyed = current
      expect(keyed.key).not.toBe('default')
      select(OTHER_ACCOUNT)
      freshPage()
      const { pushes, replaces } = mountOnWatchedHistory(
        [{ pathname: keyed.pathname, key: keyed.key, state: keyed.state }],
        0,
        'screen'
      )
      expect(current.key).toBe(keyed.key)
      expect(pushes).not.toHaveBeenCalled()
      expect(replaces).not.toHaveBeenCalled()
      expect(rendered.screen).not.toContain(OTHER_ACCOUNT)
      expect(reads.screen.account).toBe(ACCOUNT)
      expect(reads.screen.differs).toBe(true)
      // A second load decides the same way.
      freshPage()
      mountOn({ pathname: keyed.pathname, key: keyed.key, state: keyed.state }, 'screen')
      expect(reads.screen.account).toBe(ACCOUNT)
    }
  )

  it('replaces the unpushed entry once for every reader, and not again on a rerender or a new selection', () => {
    mockSelected.state = { account: { addr: ACCOUNT } }
    const { history, pushes, replaces } = mountOnWatchedHistory(
      [UNPUSHED, LATER_ENTRY],
      0,
      'chrome',
      'screen'
    )
    expect(replaces).toHaveBeenCalledTimes(1)
    const keyed = current.key
    expect(keyed).not.toBe('default')
    act(() => {
      root.render(
        <HistoryRouter history={history}>
          <Navigator />
          <Probe name="chrome" />
          <Probe name="screen" />
        </HistoryRouter>
      )
    })
    select(OTHER_ACCOUNT)
    select(ACCOUNT)
    expect(replaces).toHaveBeenCalledTimes(1)
    expect(pushes).not.toHaveBeenCalled()
    expect(current.key).toBe(keyed)
    expect(reads.chrome.account).toBe(ACCOUNT)
    expect(reads.screen.account).toBe(ACCOUNT)
  })

  it('leaves the unpushed entry and latches nothing until the wallet selects an account', () => {
    const { pushes, replaces } = mountOnWatchedHistory([UNPUSHED, LATER_ENTRY], 0, 'screen')
    expect(current.key).toBe('default')
    expect(reads.screen.account).toBeUndefined()
    expect(replaces).not.toHaveBeenCalled()
    expect(pushes).not.toHaveBeenCalled()
    expect(Object.values(sessionStorage)).not.toContain(ACCOUNT)
    select(ACCOUNT)
    expect(current.key).not.toBe('default')
    expect(replaces).toHaveBeenCalledTimes(1)
    expect(reads.screen.account).toBe(ACCOUNT)
    select(OTHER_ACCOUNT)
    expect(reads.screen.account).toBe(ACCOUNT)
    expect(reads.screen.differs).toBe(true)
  })
})
