/**
 * The account a setup visit works on. A visit starts when the holder arrives at
 * the setup from outside it, and the tab latches the wallet's selected account
 * then. The latch holds across a selection change in the wallet, the navigation
 * inside the setup and a reload, so a draft stays with its account. The latch
 * and the visit's locations live in the tab's session storage. An entry the
 * router did not push carries no key of its own, so the hook replaces it once
 * with a keyed entry for the same URL and state, which the visit can hold.
 */
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Location } from 'react-router-dom'
import { isAddress, isAddressEqual } from 'viem'
import type { Address } from 'viem'

import { WEB_ROUTES } from '@common/modules/router/constants/common'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'

import type { SetupAccount, VisitDecision, VisitedLocation } from './types'

const LATCH_KEY = 'socialRecovery.setupAccount'
const VISIT_KEY = 'socialRecovery.setupVisit'
const VISIT_LIMIT = 50
// The router gives this key to every entry it did not push, such as a typed URL.
const UNPUSHED_KEY = 'default'

const SETUP_PATH = `/${WEB_ROUTES.socialRecoverySetup}`
const CEREMONY_PATH = `/${WEB_ROUTES.socialRecoveryCeremony}`

const listeners = new Set<() => void>()

// The location this page already decided on, so the chrome and the screen that
// both read it, and a view that remounts on it, decide once.
let settledLocation: VisitedLocation | null = null

// The unpushed entry this page already latched and replaced, so the replace
// happens once for it, whichever reader runs first.
let replacedLocation: Location | null = null

const sessionStore = (): Storage | undefined => {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage
  } catch {
    return undefined
  }
}

const readStored = (key: string): string | null => {
  try {
    return sessionStore()?.getItem(key) ?? null
  } catch {
    return null
  }
}

const store = (key: string, value: string) => {
  try {
    sessionStore()?.setItem(key, value)
  } catch {
    // Without session storage the tab follows the wallet's selection.
  }
}

// The stored value comes back from storage, so only an address counts as a latch.
const readLatch = (): Address | null => {
  const stored = readStored(LATCH_KEY)
  return stored !== null && isAddress(stored) ? stored : null
}

const latch = (account: Address) => {
  store(LATCH_KEY, account)
  listeners.forEach((listener) => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const isVisitedLocation = (value: unknown): value is VisitedLocation =>
  typeof value === 'object' &&
  value !== null &&
  'key' in value &&
  typeof value.key === 'string' &&
  'pathname' in value &&
  typeof value.pathname === 'string'

// The list comes back from storage, so only well-formed entries count.
const readVisit = (): VisitedLocation[] => {
  const stored = readStored(VISIT_KEY)
  if (stored === null) {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed.filter(isVisitedLocation) : []
  } catch {
    return []
  }
}

const storeVisit = (visit: VisitedLocation[]) => {
  store(VISIT_KEY, JSON.stringify(visit.slice(-VISIT_LIMIT)))
}

const visitedOf = ({ key, pathname }: Location): VisitedLocation => ({ key, pathname })

const isUnder = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(`${base}/`)

const isSetupPath = (pathname: string) => isUnder(pathname, SETUP_PATH)

const isModulePath = (pathname: string) => isSetupPath(pathname) || isUnder(pathname, CEREMONY_PATH)

// The entry's state is whatever the history holds, so it is checked.
const prevPathnameOf = (state: unknown): string | undefined => {
  const prevRoute =
    typeof state === 'object' && state !== null && 'prevRoute' in state
      ? state.prevRoute
      : undefined
  const pathname =
    typeof prevRoute === 'object' && prevRoute !== null && 'pathname' in prevRoute
      ? prevRoute.pathname
      : undefined
  return typeof pathname === 'string' ? pathname : undefined
}

// An entry the router did not push (a typed URL, the wallet opening the setup in
// its reused tab, or a reload of such an entry) is an arrival, even at a path
// the page already settled, until the page latches and replaces that entry. A
// location the visit already settled keeps the latch: a later reader of the
// same location, Back, Forward, or a reload of an entry the router pushed. Any
// other new entry stays in the visit when its previous route is a setup route,
// or, with no previous route, when the visit's last location is a setup or
// ceremony route; otherwise it is an arrival.
const decide = (location: Location): VisitDecision => {
  if (location.key === UNPUSHED_KEY) {
    return replacedLocation === location ? 'settled' : 'arrival'
  }
  if (settledLocation?.key === location.key && settledLocation.pathname === location.pathname) {
    return 'settled'
  }
  const visit = readVisit()
  if (visit.some(({ key }) => key === location.key)) {
    return 'settled'
  }
  const prevPathname = prevPathnameOf(location.state)
  if (prevPathname !== undefined) {
    return isSetupPath(prevPathname) ? 'inside' : 'arrival'
  }
  const last = visit[visit.length - 1]
  return last && isModulePath(last.pathname) ? 'inside' : 'arrival'
}

// The location joins the visit as its last location.
const record = (location: Location) => {
  settledLocation = visitedOf(location)
  storeVisit([...readVisit().filter(({ key }) => key !== location.key), visitedOf(location)])
}

// A new visit starts at the location. An entry the router did not push cannot
// be told apart later, so it starts the visit with no location in the list, and
// the keyed entry that replaces it then starts the visit again as an arrival.
const startVisit = (location: Location) => {
  settledLocation = visitedOf(location)
  storeVisit(location.key === UNPUSHED_KEY ? [] : [visitedOf(location)])
}

const useSetupAccount = (): SetupAccount => {
  const location = useLocation()
  const navigate = useNavigate()
  const { account: selectedAccount } = useSelectedAccountControllerState()
  // The controller's account address is a plain string; only a real address counts.
  const selected =
    selectedAccount?.addr && isAddress(selectedAccount.addr) ? selectedAccount.addr : undefined
  const stored = useSyncExternalStore(subscribe, readLatch)
  // On an arrival the earlier visit's latch no longer counts, even before the
  // new one is stored.
  const latched = decide(location) === 'arrival' ? null : stored

  useEffect(() => {
    if (!selected) {
      return
    }
    if (location.key === UNPUSHED_KEY) {
      if (replacedLocation === location) {
        return
      }
      replacedLocation = location
      startVisit(location)
      latch(selected)
      const { pathname, search, hash, state } = location
      navigate({ pathname, search, hash }, { replace: true, state })
      return
    }
    if (decide(location) === 'arrival') {
      startVisit(location)
      latch(selected)
      return
    }
    record(location)
    if (!stored) {
      latch(selected)
    }
  }, [location, navigate, selected, stored])

  const account = latched ?? selected
  const differs = !!account && !!selected && !isAddressEqual(account, selected)

  const switchToSelected = useCallback(() => {
    if (selected) {
      startVisit(location)
      latch(selected)
    }
  }, [location, selected])

  return useMemo(
    () => ({
      account,
      differs,
      selected: differs ? selected : undefined,
      switchToSelected
    }),
    [account, differs, selected, switchToSelected]
  )
}

export default useSetupAccount
