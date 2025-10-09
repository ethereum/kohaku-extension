/* eslint-disable no-console */
import React, { useEffect } from 'react'
import useBackgroundService from '@web/hooks/useBackgroundService'
import DashboardScreen from './dashboard/screens/DashboardScreen'
import usePrivacyPoolsForm from '../hooks/usePrivacyPoolsForm'

const HomeScreen = () => {
  const { dispatch } = useBackgroundService()
  const {
    isAccountLoaded,
    poolAccounts,
    totalApprovedBalance,
    totalPendingBalance,
    totalDeclinedBalance
  } = usePrivacyPoolsForm()

  console.log('DEBUG: totalApprovedBalance', totalApprovedBalance)
  console.log('DEBUG: totalPendingBalance', totalPendingBalance)
  console.log('DEBUG: totalDeclinedBalance', totalDeclinedBalance)
  console.log({ isAccountLoaded, poolAccounts })

  useEffect(() => {
    return () => {
      dispatch({ type: 'PRIVACY_POOLS_CONTROLLER_UNLOAD_SCREEN' })
    }
  }, [dispatch])

  return <DashboardScreen />
}

export default React.memo(HomeScreen)
