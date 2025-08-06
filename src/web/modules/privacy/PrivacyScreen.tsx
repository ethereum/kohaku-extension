import { ROUTES } from '@common/modules/router/constants/common'
import React, { useCallback } from 'react'
import { View } from 'react-native'
import useNavigation from '@common/hooks/useNavigation'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { Wrapper } from '@web/components/TransactionsScreen'
import DepositManager from './components/DepositManager'
import SeedPhraseManager from './components/SeedPhraseManager'
import WithdrawalManager from './components/WithdrawalManager'
import AccountOverview from './components/AccountOverview'

const PrivacyScreen = () => {
  const { navigate } = useNavigation()

  const onBack = useCallback(() => {
    navigate(ROUTES.dashboard)
  }, [navigate])

  return (
    <Wrapper title="Privacy" handleGoBack={onBack} buttons={[]}>
      <View style={[spacings.p16, flexbox.flex1, { overflow: 'scroll', padding: '16px' }]}>
        <View style={[flexbox.flex1, spacings.mt16]}>
          <SeedPhraseManager />

          <DepositManager />

          <WithdrawalManager />

          <AccountOverview />
        </View>
      </View>
    </Wrapper>
  )
}

export default React.memo(PrivacyScreen)
