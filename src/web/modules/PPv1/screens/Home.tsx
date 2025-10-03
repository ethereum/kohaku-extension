/* eslint-disable no-console */
import React, { useEffect, useRef } from 'react'
import useBackgroundService from '@web/hooks/useBackgroundService'
import DashboardScreen from './dashboard/screens/DashboardScreen'
import usePrivacyPoolsForm from '../hooks/usePrivacyPoolsForm'

const HomeScreen = () => {
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

  return <DashboardScreen />
}

export default React.memo(HomeScreen)
