import React, { useCallback, useEffect } from 'react'
import { ROUTES } from '@common/modules/router/constants/common'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useNavigation from '@common/hooks/useNavigation'
import usePrivacyPoolsControllerState from '@web/hooks/usePrivacyPoolsControllerState'
import DashboardScreen from './dashboard/screens/DashboardScreen'

const HomeScreen = () => {
  const { navigate } = useNavigation()
  const { dispatch } = useBackgroundService()
  const state = usePrivacyPoolsControllerState()

  // DEBUG: temporary log
  // eslint-disable-next-line no-console
  console.log('PPv2 state: ', { state })

  const onBack = useCallback(() => {
    navigate(ROUTES.dashboard)
  }, [navigate])

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
