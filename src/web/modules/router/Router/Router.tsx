import React, { lazy, Suspense, useContext } from 'react'
import { StyleSheet, View } from 'react-native'
import { Navigate, Route, Routes } from 'react-router-dom'

import Alert from '@common/components/Alert'
import { useTranslation } from '@common/config/localization'
import useRoute from '@common/hooks/useRoute'
import useTheme from '@common/hooks/useTheme'
import { AUTH_STATUS } from '@common/modules/auth/constants/authStatus'
import useAuth from '@common/modules/auth/hooks/useAuth'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import flexbox from '@common/styles/utils/flexbox'
import Splash from '@web/components/Splash'
import { ControllersStateLoadedContext } from '@web/contexts/controllersStateLoadedContext'
import useActionsControllerState from '@web/hooks/useActionsControllerState'
import useCurrentActionSideEffects from '@web/hooks/useCurrentActionSideEffects'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'
import useSwapAndBridgeControllerState from '@web/hooks/useSwapAndBridgeControllerState'
import useTransferControllerState from '@web/hooks/useTransferControllerState'
import KeyStoreUnlockScreen from '@web/modules/keystore/screens/KeyStoreUnlockScreen'
import AuthenticatedRoute from '@web/modules/router/components/AuthenticatedRoute'
import KeystoreUnlockedRoute from '@web/modules/router/components/KeystoreUnlockedRoute'

import DashboardScreen from '@common/modules/dashboard/screens'
import KohakuDashboardScreen from '@web/modules/PPv1/screens/dashboard/screens/KohakuDashboardScreen'
import { getInitialRoute } from './helpers'
import getStyles from './styles'

const AsyncMainRoute = lazy(() => import('@web/modules/router/components/MainRoutes'))

const Router = () => {
  const { t } = useTranslation()
  const { styles } = useTheme(getStyles)
  const { path } = useRoute()
  const pathname = path?.substring(1)
  const { authStatus } = useAuth()
  const keystoreState = useKeystoreControllerState()
  const actionsState = useActionsControllerState()
  const swapAndBridgeState = useSwapAndBridgeControllerState()
  const transferState = useTransferControllerState()
  const { areControllerStatesLoaded, isStatesLoadingTakingTooLong } = useContext(
    ControllersStateLoadedContext
  )
  useCurrentActionSideEffects()

  if (isStatesLoadingTakingTooLong && !areControllerStatesLoaded) {
    return (
      <View style={[StyleSheet.absoluteFill, flexbox.center]}>
        <Alert
          type="warning"
          title={t(
            "The initial loading is taking longer than expected. This might be due to a connection issue on your side - or a glitch on ours. If it doesn't resolve soon, please try disabling and re-enabling the extension, or restarting your browser."
          )}
          style={{ maxWidth: 500 }}
        />
      </View>
    )
  }

  if (authStatus === AUTH_STATUS.LOADING || !areControllerStatesLoaded) {
    return <Splash />
  }

  // Never move this above the check for `areControllerStatesLoaded`
  const initialRoute = getInitialRoute({
    keystoreState,
    authStatus,
    actionsState,
    swapAndBridgeState,
    transferState: transferState.state
  })

  if (initialRoute && !pathname) {
    return <Navigate to={initialRoute} replace />
  }

  return (
    <View style={styles.container}>
      <Routes>
        <Route element={<KeystoreUnlockedRoute />}>
          <Route element={<AuthenticatedRoute />}>
            <Route path={WEB_ROUTES.dashboard} element={<DashboardScreen />} />
            <Route path={WEB_ROUTES.mainDashboard} element={<KohakuDashboardScreen />} />
          </Route>
        </Route>
        <Route path={WEB_ROUTES.keyStoreUnlock} element={<KeyStoreUnlockScreen />} />
      </Routes>
      <Suspense fallback={null}>
        <AsyncMainRoute />
      </Suspense>
    </View>
  )
}

export default Router
