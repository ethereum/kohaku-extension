/* eslint-disable no-console */
import React, { useCallback, useEffect, useRef } from 'react'
import useBackgroundService from '@web/hooks/useBackgroundService'
import DashboardScreen from './dashboard/screens/DashboardScreen'
import usePrivacyPoolsForm from '../hooks/usePrivacyPoolsForm'

const HomeScreen = () => {
  const { dispatch } = useBackgroundService()
  const {
    loadSeedPhrase,
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

  const handleLoadAccountWrapped = useCallback(async () => {
    await loadSeedPhrase()
    await handleLoadAccount()
  }, [loadSeedPhrase, handleLoadAccount])

  useEffect(() => {
    if (!isAccountLoaded && !hasLoadedRef.current) {
      hasLoadedRef.current = true
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      handleLoadAccountWrapped()
    }
  }, [handleLoadAccountWrapped, isAccountLoaded, hasLoadedRef])

  useEffect(() => {
    return () => {
      dispatch({ type: 'PRIVACY_POOLS_CONTROLLER_UNLOAD_SCREEN' })
    }
  }, [dispatch])

  return <DashboardScreen />
}

export default React.memo(HomeScreen)
