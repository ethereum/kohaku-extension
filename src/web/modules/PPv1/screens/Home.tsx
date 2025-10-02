import React, { useCallback, useEffect, useRef } from 'react'
import { ROUTES } from '@common/modules/router/constants/common'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useNavigation from '@common/hooks/useNavigation'
import DashboardScreen from './dashboard/screens/DashboardScreen'
import usePrivacyPoolsForm from '../hooks/usePrivacyPoolsForm'

const HomeScreen = () => {
  const { navigate } = useNavigation()
  const { dispatch } = useBackgroundService()
  const { handleLoadAccount, isAccountLoaded } = usePrivacyPoolsForm()
  const hasLoadedRef = useRef(false)

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
    // <Wrapper title="Privacy Pools" handleGoBack={onBack} buttons={[]}>
    // <View style={[spacings.p16, flexbox.flex1, { overflow: 'scroll', padding: '16px' }]}>
    // <h1> PPv2 Home</h1>

    <div>
      <button type="button" onClick={onBack}>
        Back
      </button>
      <DashboardScreen />
    </div>
    // </View>
    // </Wrapper>
  )
}

export default React.memo(HomeScreen)
