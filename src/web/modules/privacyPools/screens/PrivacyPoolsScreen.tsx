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
    depositAmount,
    targetAddress,
    accountService,
    withdrawalAmount,
    isLoadingAccount,
    selectedPoolAccount,
    isRagequitLoading,
    handleDeposit,
    handleRagequit,
    handleWithdrawal,
    handleUpdateForm,
    handleLoadAccount,
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
            onUpdateForm={handleUpdateForm}
            onLoadAccount={handleLoadAccount}
            onGenerateSeedPhrase={handleGenerateSeedPhrase}
          />

          <DepositManager
            poolInfo={poolInfo}
            amount={depositAmount}
            onValueChange={handleUpdateForm}
            onDeposit={handleDeposit}
          />

          <WithdrawalManager
            poolInfo={poolInfo}
            amount={withdrawalAmount}
            poolAccounts={poolAccounts}
            targetAddress={targetAddress}
            onValueChange={handleUpdateForm}
            onWithdrawal={handleWithdrawal}
          />

          <AccountOverview
            poolAccounts={poolAccounts}
            accountService={accountService}
            selectedAccount={selectedPoolAccount}
            isLoadingAccount={isLoadingAccount}
            onRagequit={handleRagequit}
            isRagequitLoading={isRagequitLoading}
            onSelectAccount={handleSelectedAccount}
          />
        </View>
      </View>
    </Wrapper>
  )
}

export default React.memo(PrivacyPoolsScreen)
