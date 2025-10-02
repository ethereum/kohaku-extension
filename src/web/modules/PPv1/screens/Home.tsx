/* eslint-disable no-console */
import React, { useCallback, useEffect, useRef } from 'react'
import { ROUTES } from '@common/modules/router/constants/common'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useNavigation from '@common/hooks/useNavigation'
import DashboardScreen from './dashboard/screens/DashboardScreen'
import usePrivacyPoolsForm from '../hooks/usePrivacyPoolsForm'

const HomeScreen = () => {
  const { navigate } = useNavigation()
  const { dispatch } = useBackgroundService()
  const {
    handleLoadAccount,
    isAccountLoaded,
    poolAccounts,
    totalApprovedBalance,
    totalPendingBalance,
    totalDeclinedBalance
  } = usePrivacyPoolsForm()
  const hasLoadedRef = useRef(false)

  console.log('DEBUG: totalApprovedBalance', totalApprovedBalance)
  console.log('DEBUG: totalPendingBalance', totalPendingBalance)
  console.log('DEBUG: totalDeclinedBalance', totalDeclinedBalance)
  console.log({ isAccountLoaded, poolAccounts })

  const onBack = useCallback(() => {
    navigate(ROUTES.dashboard)
  }, [navigate])

  useEffect(() => {
    if (!isAccountLoaded && !hasLoadedRef.current) {
      hasLoadedRef.current = true
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      handleLoadAccount()
    }
  }, [handleLoadAccount, isAccountLoaded])

  useEffect(() => {
    return () => {
      dispatch({ type: 'PRIVACY_POOLS_CONTROLLER_UNLOAD_SCREEN' })
    }
  }, [dispatch])

  return (
    <div>
      <button type="button" onClick={onBack}>
        Back
      </button>
      <DashboardScreen />
    </div>
  )
}

export default React.memo(HomeScreen)
