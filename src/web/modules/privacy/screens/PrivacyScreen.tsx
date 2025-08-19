import React, { useCallback } from 'react'
import { ROUTES } from '@common/modules/router/constants/common'
import { View } from 'react-native'
import { Wrapper } from '@web/components/TransactionsScreen'
import useNavigation from '@common/hooks/useNavigation'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import DepositManager from '../components/DepositManager'
import SeedPhraseManager from '../components/SeedPhraseManager'
import WithdrawalManager from '../components/WithdrawalManager'
import AccountOverview from '../components/AccountOverview'

import { usePP } from '../hooks/usePP'
import usePrivacyForm from '../hooks/usePrivacyForm'

const PrivacyScreen = () => {
  const { navigate } = useNavigation()
  const {
    message,
    seedPhrase,
    poolAccounts,
    isGenerating,
    accountService,
    isLoadingAccount,
    selectedPoolAccount,
    handleUpdateForm,
    handleLoadAccount,
    handleSelectedAccount,
    handleGenerateSeedPhrase
  } = usePrivacyForm()

  const ppData = usePP()

  const onBack = useCallback(() => {
    navigate(ROUTES.dashboard)
  }, [navigate])

  return (
    <Wrapper title="Privacy" handleGoBack={onBack} buttons={[]}>
      <View style={[spacings.p16, flexbox.flex1, { overflow: 'scroll', padding: '16px' }]}>
        <View style={[flexbox.flex1, spacings.mt16]}>
          <SeedPhraseManager
            message={message}
            seedPhrase={seedPhrase}
            isGenerating={isGenerating}
            isLoadingAccount={isLoadingAccount}
            onLoadAccount={handleLoadAccount}
            onGenerateSeedPhrase={handleGenerateSeedPhrase}
            onUpdateForm={handleUpdateForm}
          />

          <DepositManager ppData={ppData} />

          <WithdrawalManager />

          <AccountOverview
            poolAccounts={poolAccounts}
            accountService={accountService}
            selectedAccount={selectedPoolAccount}
            onSelectAccount={handleSelectedAccount}
          />
        </View>
      </View>
    </Wrapper>
  )
}

export default React.memo(PrivacyScreen)
