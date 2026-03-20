import { NavigateOptions, useSearchParams } from 'react-router-dom'
import { Subject } from 'rxjs'

import { NavigationProp } from '@react-navigation/native'
import { ROUTES } from '@common/modules/router/constants/common'

interface UseNavigationReturnTypeCommon {
  navigate: (to: string, options?: NavigateOptions) => void
  goBack: NavigationProp<ReactNavigation.RootParamList>['goBack']
  searchParams: ReturnType<typeof useSearchParams>[0]
  setSearchParams: ReturnType<typeof useSearchParams>[1]
  setOptions: NavigationProp<ReactNavigation.RootParamList>['setOptions']
  canGoBack: boolean
  dashGoBack: (routes?: typeof ROUTES) => void
}

export type UseNavigationReturnType = UseNavigationReturnTypeCommon

export type TitleChangeEventStreamType = Subject<string> | null
