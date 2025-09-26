import React, { useCallback, useEffect } from 'react'
import { ROUTES } from '@common/modules/router/constants/common'
import { View } from 'react-native'
import { Wrapper } from '@web/components/TransactionsScreen'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useNavigation from '@common/hooks/useNavigation'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

const DepositScreen = () => {
  const { navigate } = useNavigation()
  const { dispatch } = useBackgroundService()

  const onBack = useCallback(() => {
    navigate(ROUTES.pp2Home)
  }, [navigate])

  useEffect(() => {
    return () => {
      dispatch({ type: 'PRIVACY_POOLS_CONTROLLER_UNLOAD_SCREEN' })
    }
  }, [dispatch])

  const handleGenerateSecrets = () => {
    dispatch({
      type: 'PRIVACY_POOLS_CONTROLLER_GENERATE_SECRET',
      params: {
        appInfo: 'noteSecre1'
      }
    })

    dispatch({
      type: 'PRIVACY_POOLS_CONTROLLER_GENERATE_KEYS'
    })
  }

  return (
    <Wrapper title="Privacy Pools" handleGoBack={onBack} buttons={[]}>
      <View style={[spacings.p16, flexbox.flex1, { overflow: 'scroll', padding: '16px' }]}>
        <button type="button" onClick={handleGenerateSecrets}>
          Generate Secrets
        </button>
        <h1> PPv2 Deposit</h1>
      </View>
    </Wrapper>
  )
}

export default React.memo(DepositScreen)
