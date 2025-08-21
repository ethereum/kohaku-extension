import React, { useCallback, useEffect } from 'react'
import { ROUTES } from '@common/modules/router/constants/common'
import { View } from 'react-native'
import { Wrapper } from '@web/components/TransactionsScreen'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useNavigation from '@common/hooks/useNavigation'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

import DepositManager from '../components/DepositManager'
import SeedPhraseManager from '../components/SeedPhraseManager'
import WithdrawalManager from '../components/WithdrawalManager'
import AccountOverview from '../components/AccountOverview'
import usePrivacyPoolsForm from '../hooks/usePrivacyPoolsForm'

const PrivacyPoolsScreen = () => {
  const { navigate } = useNavigation()
  const { dispatch } = useBackgroundService()

  const {
    message,
    poolInfo,
    seedPhrase,
    poolAccounts,
    isGenerating,
    accountService,
    isLoadingAccount,
    displayAmountValue,
    selectedPoolAccount,
    isRagequitLoading,
    handleDeposit,
    handleRagequit,
    handleUpdateForm,
    handleLoadAccount,
    handleSetMaxAmount,
    handleAmountChange,
    handleSelectedAccount,
    handleGenerateSeedPhrase
  } = usePrivacyPoolsForm()

  const onBack = useCallback(() => {
    navigate(ROUTES.dashboard)
  }, [navigate])

  useEffect(() => {
    return () => {
      dispatch({ type: 'PRIVACY_POOLS_CONTROLLER_UNLOAD_SCREEN' })
    }
  }, [dispatch])

  return (
    <Wrapper title="Privacy Pools" handleGoBack={onBack} buttons={[]}>
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

          <DepositManager
            poolInfo={poolInfo}
            displayValue={displayAmountValue}
            onAmountChange={handleAmountChange}
            onSetMaxAmount={handleSetMaxAmount}
            onDeposit={handleDeposit}
          />

          <WithdrawalManager poolInfo={poolInfo} poolAccounts={poolAccounts} />

          <AccountOverview
            poolAccounts={poolAccounts}
            accountService={accountService}
            selectedAccount={selectedPoolAccount}
            onSelectAccount={handleSelectedAccount}
            onRagequit={handleRagequit}
            isRagequitLoading={isRagequitLoading}
            isLoadingAccount={isLoadingAccount}
          />
        </View>
      </View>
    </Wrapper>
  )
}

export default React.memo(PrivacyPoolsScreen)
