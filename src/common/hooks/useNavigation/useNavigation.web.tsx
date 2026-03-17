import { useCallback, useMemo } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Subject } from 'rxjs'
import { WEB_ROUTES } from '@common/modules/router/constants/common'

import { TitleChangeEventStreamType, UseNavigationReturnType } from './types'

// Event stream that gets triggered when the title changes
export const titleChangeEventStream: TitleChangeEventStreamType = new Subject<string>()

const useNavigation = (): UseNavigationReturnType => {
  const nav = useNavigate()
  const currentRoute = useLocation()
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const [searchParams, _setSearchParams] = useSearchParams()

  const navigate = useCallback<UseNavigationReturnType['navigate']>(
    (to, options) => {
      if (typeof to === 'string' && to?.[0] !== '/') {
        to = `/${to}`
      }

      return nav(to, {
        ...options,
        state: {
          ...(options?.state || {}),
          prevRoute: currentRoute
        }
      })
    },
    [nav, currentRoute]
  )

  const goBack = useCallback(() => nav(-1), [nav])

  const setOptions = useCallback<UseNavigationReturnType['setOptions']>(({ headerTitle }) => {
    if (headerTitle) {
      document.title = headerTitle
      titleChangeEventStream.next(headerTitle)
    }

    // All other options are not supported in the web context
  }, [])

  // A custom implementation is required as the default setSearchParams
  // doesn't persist the current route state
  const setSearchParams = useCallback<UseNavigationReturnType['setSearchParams']>(
    (params) => {
      _setSearchParams(params, {
        // Persist the current route state
        state: currentRoute.state,
        replace: true
      })
    },
    [_setSearchParams, currentRoute.state]
  )

  const prevRoute = useMemo(() => {
    if (!currentRoute.state?.prevRoute) return null

    return currentRoute.state.prevRoute
  }, [currentRoute])

  const dashGoBack = useCallback(
    (routes = WEB_ROUTES) => {
      if (prevRoute) {
        goBack()
      } else {
        navigate(routes.mainDashboard)
      }
    },
    [goBack, navigate, prevRoute]
  )

  return {
    navigate,
    setOptions,
    setSearchParams,
    goBack,
    searchParams,
    canGoBack: !!prevRoute,
    dashGoBack
  }
}

export default useNavigation
