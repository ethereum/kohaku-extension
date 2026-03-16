import { useCallback, useMemo, useRef } from 'react'

import { navigationRef } from '@common/services/navigation'
import { useNavigation as useReactNavigation } from '@react-navigation/native'

import { ROUTES } from '@common/modules/router/constants/common'
import { TitleChangeEventStreamType, UseNavigationReturnType } from './types'

type UseNavigationReturnTypeNew = UseNavigationReturnType & {
  dashGoBack: (routes?: typeof ROUTES) => void
}

export const titleChangeEventStream: TitleChangeEventStreamType = null
const useNavigation = (): UseNavigationReturnTypeNew => {
  const nav = useReactNavigation()
  const interval: any = useRef(null)

  const navigate = useCallback<UseNavigationReturnType['navigate']>((to, options) => {
    const checkIsReady = () => {
      if (navigationRef?.current?.isReady()) {
        !!interval.current && clearInterval(interval.current) // Stop the interval once isReady is true
        navigationRef?.current?.navigate(to?.[0] === '/' ? to.substring(1) : to, options?.state)
      }
    }

    if (!navigationRef?.current?.isReady()) {
      interval.current = setInterval(checkIsReady, 500)
    } else {
      checkIsReady() // Call immediately if isReady is already true
    }

    if (navigationRef?.current?.isReady()) {
      return navigationRef?.current?.navigate(
        to?.[0] === '/' ? to.substring(1) : to,
        options?.state
      )
    }
  }, [])

  const canGoBack = useMemo(() => nav.canGoBack(), [nav])

  // Created this to avoid overriding the current goBack
  const dashGoBack = useCallback((routes = ROUTES) => {
    if (canGoBack) {
      nav.goBack()
    } else {
      navigate(routes.mainDashboard)
    }
  }, [])

  return {
    ...nav,
    navigate,
    canGoBack,
    dashGoBack
  }
}

export default useNavigation
