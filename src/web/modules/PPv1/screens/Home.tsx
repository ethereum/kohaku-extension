/* eslint-disable no-console */
import React, { useEffect, useRef } from 'react'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useToast from '@common/hooks/useToast'
import DashboardScreen from './dashboard/screens/DashboardScreen'
import usePrivacyPoolsForm from '../hooks/usePrivacyPoolsForm'

const HomeScreen = () => {
  const { dispatch } = useBackgroundService()
  const { addToast } = useToast()
  const { isAccountLoaded, isReadyToLoad, loadPrivateAccount } = usePrivacyPoolsForm()
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (!isAccountLoaded && !hasLoadedRef.current && isReadyToLoad) {
      hasLoadedRef.current = true
      loadPrivateAccount().catch((error) => {
        console.error('Failed to load private account:', error)
        addToast('Failed to load your privacy account. Please try again.', { type: 'error' })
      })
    }
  }, [isAccountLoaded, isReadyToLoad, loadPrivateAccount, addToast])

  useEffect(() => {
    return () => {
      dispatch({ type: 'PRIVACY_POOLS_CONTROLLER_UNLOAD_SCREEN' })
    }
  }, [dispatch])

  return <DashboardScreen />
}

export default React.memo(HomeScreen)
