import React, { useCallback, useEffect } from 'react'
import { ROUTES } from '@common/modules/router/constants/common'
import { View } from 'react-native'
import { Wrapper } from '@web/components/TransactionsScreen'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useNavigation from '@common/hooks/useNavigation'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

const TransferScreen = () => {
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

  return (
    <Wrapper title="Privacy Pools" handleGoBack={onBack} buttons={[]}>
      <View style={[spacings.p16, flexbox.flex1, { overflow: 'scroll', padding: '16px' }]}>
        <h1> PPv2 Transfer</h1>
      </View>
    </Wrapper>
  )
}

export default React.memo(TransferScreen)
