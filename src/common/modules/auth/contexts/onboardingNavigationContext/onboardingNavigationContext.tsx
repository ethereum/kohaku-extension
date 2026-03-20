/* eslint-disable no-restricted-syntax */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { NavigateOptions } from 'react-router-dom'

import { Account } from '@ambire-common/interfaces/account'
import { parse, stringify } from '@ambire-common/libs/richJson/richJson'
import useNavigation from '@common/hooks/useNavigation'
import usePrevious from '@common/hooks/usePrevious'
import useRoute from '@common/hooks/useRoute'
import { AUTH_STATUS } from '@common/modules/auth/constants/authStatus'
import useAuth from '@common/modules/auth/hooks/useAuth'
import { ONBOARDING_WEB_ROUTES, WEB_ROUTES } from '@common/modules/router/constants/common'
import { ControllersStateLoadedContext } from '@web/contexts/controllersStateLoadedContext'
import useAccountPickerControllerState from '@web/hooks/useAccountPickerControllerState'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'
import useWalletStateController from '@web/hooks/useWalletStateController'
import { getUiType } from '@web/utils/uiType'

export type OnboardingRoute = typeof ONBOARDING_WEB_ROUTES[number]
type HwWalletsNeedingRedirect = 'trezor' | 'lattice' | null

const OnboardingNavigationContext = createContext<{
  isOnboardingRoute: boolean
  goToNextRoute: (routeName?: OnboardingRoute, routeParams?: NavigateOptions) => void
  goToPrevRoute: () => void
  setTriggeredHwWalletFlow: React.Dispatch<React.SetStateAction<HwWalletsNeedingRedirect>>
  setAccountsToPersonalize: React.Dispatch<React.SetStateAction<Account[]>>
  accountsToPersonalize: Account[]
}>({
  isOnboardingRoute: false,
  goToNextRoute: () => {},
  goToPrevRoute: () => {},
  setTriggeredHwWalletFlow: () => null,
  setAccountsToPersonalize: () => null,
  accountsToPersonalize: []
})

class RouteNode {
  name: string

  children: RouteNode[] = []

  disabled: boolean = false

  isProtected: boolean = true

  constructor(name: string, children: RouteNode[] = [], disabled = false, isProtected = true) {
    this.name = name
    if (children) this.children = children
    this.disabled = disabled
    this.isProtected = isProtected
  }
}

const getAccountsToPersonalizeFromSession = (): Account[] => {
  try {
    const stored = sessionStorage.getItem('accountsToPersonalize')
    return stored ? parse(stored) : []
  } catch {
    return []
  }
}

const OnboardingNavigationProvider = ({ children }: { children: React.ReactNode }) => {
  const { hasPasswordSecret } = useKeystoreControllerState()
  const { path, params } = useRoute()
  const prevPath: string | undefined = usePrevious(path)
  const { navigate } = useNavigation()
  const { authStatus } = useAuth()
  const { dispatch } = useBackgroundService()
  const { isSetupComplete } = useWalletStateController()
  const { accounts } = useAccountsControllerState()
  const { isInitialized, subType, initParams, type } = useAccountPickerControllerState()
  const isOnboardingRoute = useMemo(
    () => ONBOARDING_WEB_ROUTES.includes((path || '').substring(1)),
    [path]
  )
  const { areControllerStatesLoaded } = useContext(ControllersStateLoadedContext)

  // session storage is needed here to prevent state reset on account-personalize page reload
  const [accountsToPersonalize, setAccountsToPersonalize] = useState<Account[]>(() => {
    const currentRoute = path?.substring(1)
    if (currentRoute === WEB_ROUTES.accountPersonalize) return getAccountsToPersonalizeFromSession()

    return []
  })

  useEffect(() => {
    const currentRoute = path?.substring(1)
    if (currentRoute === WEB_ROUTES.accountPersonalize)
      sessionStorage.setItem('accountsToPersonalize', stringify(accountsToPersonalize))
  }, [accountsToPersonalize, path])

  useEffect(() => {
    const currentRoute = path?.substring(1)
    if (currentRoute !== WEB_ROUTES.accountPersonalize) {
      sessionStorage.removeItem('accountsToPersonalize')
      if (accountsToPersonalize.length) setAccountsToPersonalize([])
    }
  }, [path, accountsToPersonalize.length])

  const onboardingRoutesTree = useMemo(() => {
    const nextAccountPickerRoutes =
      subType === 'hw'
        ? [
            new RouteNode(
              WEB_ROUTES.accountPicker,
              [
                new RouteNode(
                  WEB_ROUTES.accountPersonalize,
                  [
                    new RouteNode(
                      WEB_ROUTES.onboardingCompleted,
                      [new RouteNode('/')],
                      isSetupComplete || !accounts?.length
                    ),
                    new RouteNode('/')
                  ],
                  false,
                  false
                ),
                new RouteNode('/')
              ],
              false,
              false
            )
          ]
        : [
            new RouteNode(
              WEB_ROUTES.accountPicker,
              [
                new RouteNode(
                  WEB_ROUTES.accountPersonalize,
                  [
                    new RouteNode(
                      WEB_ROUTES.onboardingCompleted,
                      [new RouteNode('/')],
                      isSetupComplete || !accounts?.length
                    ),
                    new RouteNode('/')
                  ],
                  false,
                  false
                ),
                new RouteNode('/')
              ],
              false,
              false
            )
          ]
    const common = [
      new RouteNode(WEB_ROUTES.keyStoreSetup, nextAccountPickerRoutes, hasPasswordSecret)
    ]

    return new RouteNode(
      WEB_ROUTES.getStarted,
      [
        new RouteNode(
          WEB_ROUTES.createSeedPhrasePrepare,
          [new RouteNode(WEB_ROUTES.createSeedPhraseWrite, common)],
          false,
          false
        ),
        new RouteNode(
          WEB_ROUTES.importExistingAccount,
          [
            ...(common[0].disabled ? common[0].children : common),
            new RouteNode(WEB_ROUTES.importPrivateKey, common, false, false),
            new RouteNode(WEB_ROUTES.importSeedPhrase, common, false, false),
            new RouteNode(WEB_ROUTES.ledgerConnect, common, false, false),
            new RouteNode(WEB_ROUTES.importSmartAccountJson, common, false, false)
          ],
          false,
          false
        ),
        new RouteNode(WEB_ROUTES.viewOnlyAccountAdder, common, false, false)
      ],
      authStatus !== AUTH_STATUS.NOT_AUTHENTICATED,
      false
    )
  }, [hasPasswordSecret, authStatus, isSetupComplete, subType, accounts?.length])

  const loadHistory = () => {
    try {
      const savedHistory = sessionStorage.getItem('onboarding_history')
      if (savedHistory) return JSON.parse(savedHistory)
    } catch (error) {
      console.error('Failed to load navigation state:', error)
    }
    return []
  }

  const [history, setHistory] = useState<string[]>(loadHistory())

  useEffect(() => {
    sessionStorage.setItem('onboarding_history', JSON.stringify(history))
  }, [history])

  const deepSearchRouteNode = useCallback(
    (node: RouteNode, routeName: string): RouteNode | null => {
      if (node.name === routeName) return node

      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          const found = deepSearchRouteNode(child, routeName)
          if (found) return found
        }
      }

      return null
    },
    []
  )

  const findNextEnabledRoute = useCallback(
    (nodes: RouteNode[], targetName?: OnboardingRoute): RouteNode | null => {
      if (targetName) {
        const node = nodes.find((n) => n.name === targetName)

        if (!node) return null

        if (!node.disabled) {
          return node
        }

        return findNextEnabledRoute(node.children)
      }

      const firstEnabled = nodes.find((node) => !node.disabled)
      if (firstEnabled) return firstEnabled

      for (const node of nodes) {
        if (node.children && node.children.length > 0) {
          const deepEnabled = findNextEnabledRoute(node.children)
          if (deepEnabled) return deepEnabled
        }
      }

      return null
    },
    []
  )

  const goToNextRoute = useCallback(
    (routeName?: OnboardingRoute, routeParams?: NavigateOptions) => {
      const currentRoute = path?.substring(1) || '/'

      let nextRoute: RouteNode | null = null
      if (routeName && ONBOARDING_WEB_ROUTES.includes(routeName)) {
        nextRoute = deepSearchRouteNode(onboardingRoutesTree, routeName)
      } else {
        const currentNode = deepSearchRouteNode(onboardingRoutesTree, currentRoute)
        if (!currentNode) return
        nextRoute = findNextEnabledRoute(currentNode.children, routeName)
      }

      if (nextRoute) {
        if (nextRoute.name === '/') {
          dispatch({ type: 'OPEN_EXTENSION_POPUP' })
        } else {
          navigate(nextRoute.name, {
            state: { ...routeParams, internal: true }
          })
        }
        if (!history.includes(currentRoute)) {
          setHistory((prevHistory) => [...prevHistory, currentRoute])
        }
      }
    },
    [
      onboardingRoutesTree,
      findNextEnabledRoute,
      navigate,
      deepSearchRouteNode,
      path,
      history,
      dispatch
    ]
  )

  const goToPrevRoute = useCallback(() => {
    const newHistory = [...history]

    if (!history.length) {
      navigate('/')
      setHistory([])
      return
    }

    while (newHistory.length > 0) {
      const prevRouteName = newHistory[newHistory.length - 1]
      const prevRoute = deepSearchRouteNode(onboardingRoutesTree, prevRouteName)
      newHistory.pop()
      if (!prevRoute) {
        navigate('/')
        setHistory([])
        return
      }

      if (!prevRoute.disabled) {
        navigate(prevRoute.name, { state: { internal: true } })
        setHistory(newHistory)
        return
      }
    }
  }, [history, deepSearchRouteNode, onboardingRoutesTree, navigate])

  const [onboardingInitialized, setOnboardingInitialized] = useState(false)
  const [triggeredHwWalletFlow, setTriggeredHwWalletFlow] = useState<HwWalletsNeedingRedirect>(null)

  useEffect(() => {
    if (getUiType().isPopup) return

    const currentRoute = path?.substring(1)
    if (!currentRoute) return

    if (ONBOARDING_WEB_ROUTES.includes(currentRoute) && !onboardingInitialized) {
      setOnboardingInitialized(true)
    }

    if (!ONBOARDING_WEB_ROUTES.includes(currentRoute) && onboardingInitialized) {
      setOnboardingInitialized(false)
    }
  }, [onboardingInitialized, path])

  useEffect(() => {
    const shouldRedirectToHwWalletFlow =
      initParams && type && ['lattice', 'trezor'].includes(type) && triggeredHwWalletFlow
    if (shouldRedirectToHwWalletFlow) {
      setTriggeredHwWalletFlow(null)

      const currentRoute = path?.substring(1)
      const nextRoute =
        currentRoute && ONBOARDING_WEB_ROUTES.includes(currentRoute)
          ? undefined
          : WEB_ROUTES.accountPicker
      goToNextRoute(nextRoute)
    }
  }, [goToNextRoute, initParams, type, triggeredHwWalletFlow, path])

  // Reset the AccountPickerController if it is initialized and
  // the current route is not one of 'account-personalize' or 'account-picker'
  useEffect(() => {
    if (!onboardingInitialized) return
    if (!isInitialized) return

    const currentRoute = path?.substring(1) || ''
    if (!currentRoute) return

    const shouldResetAccountPicker = ![
      WEB_ROUTES.accountPersonalize,
      WEB_ROUTES.accountPicker,
      WEB_ROUTES.keyStoreSetup
    ].some((r) => currentRoute.includes(r))

    if (shouldResetAccountPicker) {
      dispatch({ type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_RESET' })
    }
  }, [onboardingInitialized, path, dispatch, isInitialized, history])

  // Some routes are protected and should only be accessed through internal navigation.
  // If a user attempts to access one of these routes directly via the URL bar,
  // this hook should block the navigation and redirect them back to the previous route.
  useEffect(() => {
    if (getUiType().isPopup) return
    const currentRoute = path?.substring(1)
    const prevRoute = prevPath?.substring(1)
    if (!currentRoute) return
    if (!ONBOARDING_WEB_ROUTES.includes(currentRoute)) return
    const node = deepSearchRouteNode(onboardingRoutesTree, currentRoute)

    if (!node) {
      !!prevRoute && navigate(prevRoute, { state: { internal: true } })
      return
    }

    if (node.isProtected) {
      if (!params || !params.internal) {
        !!prevRoute && navigate(prevRoute, { state: { internal: true } })
      }
    }
  }, [path, prevPath, params, deepSearchRouteNode, navigate, onboardingRoutesTree, history])

  // Reset the onboarding history state in case we are no longer on an onboarding route
  useEffect(() => {
    if (path === '/' && history.length) {
      setHistory([])
    }
  }, [history.length, path])

  useEffect(() => {
    if (getUiType().isPopup) return

    const handleBackButton = () => {
      const changedRoute = window.location.hash.replace('#/', '')
      if (!history.length) return
      if (!ONBOARDING_WEB_ROUTES.includes(changedRoute)) return

      const node = deepSearchRouteNode(onboardingRoutesTree, changedRoute)
      if (!node?.disabled) return

      goToPrevRoute()
    }

    window.addEventListener('hashchange', handleBackButton)

    return () => {
      window.removeEventListener('hashchange', handleBackButton)
    }
  }, [goToPrevRoute, history, deepSearchRouteNode, onboardingRoutesTree])

  useEffect(() => {
    const currentRoute = path?.substring(1)
    if (!currentRoute) return
    if (!areControllerStatesLoaded) return

    if (
      !hasPasswordSecret &&
      authStatus === AUTH_STATUS.AUTHENTICATED &&
      !ONBOARDING_WEB_ROUTES.includes(currentRoute)
    ) {
      goToNextRoute(WEB_ROUTES.keyStoreSetup)
    }
  }, [authStatus, path, goToNextRoute, hasPasswordSecret, areControllerStatesLoaded])

  const value = useMemo(
    () => ({
      isOnboardingRoute,
      goToNextRoute,
      goToPrevRoute,
      setTriggeredHwWalletFlow,
      setAccountsToPersonalize,
      accountsToPersonalize
    }),
    [
      isOnboardingRoute,
      goToPrevRoute,
      goToNextRoute,
      setTriggeredHwWalletFlow,
      setAccountsToPersonalize,
      accountsToPersonalize
    ]
  )
  return (
    <OnboardingNavigationContext.Provider value={value}>
      {children}
    </OnboardingNavigationContext.Provider>
  )
}

export { OnboardingNavigationContext, OnboardingNavigationProvider }
