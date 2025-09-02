import React, { useCallback, useEffect, useMemo } from 'react'
import { View } from 'react-native'
import { useModalize } from 'react-native-modalize'
import { useTranslation } from 'react-i18next'

import { getUiType } from '@web/utils/uiType'
import { ROUTES } from '@common/modules/router/constants/common'
import { Wrapper } from '@web/components/TransactionsScreen'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useNavigation from '@common/hooks/useNavigation'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import Text from '@common/components/Text'

import { AccountOpStatus } from '@ambire-common/libs/accountOp/types'
import { getBenzinUrlParams } from '@ambire-common/utils/benzin'
import { Key } from '@ambire-common/interfaces/keystore'
import { SigningStatus } from '@ambire-common/controllers/signAccountOp/signAccountOp'

import useActivityControllerState from '@web/hooks/useActivityControllerState'
import useTrackAccountOp from '@web/modules/sign-account-op/hooks/OneClick/useTrackAccountOp'
import TrackProgress from '@web/modules/sign-account-op/components/OneClick/TrackProgress'
import InProgress from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/InProgress'
import Completed from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/Completed'
import Failed from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/Failed'
import Estimation from '@web/modules/sign-account-op/components/OneClick/Estimation'
import Buttons from '@web/modules/sign-account-op/components/OneClick/Buttons'

import DepositManager from '../components/DepositManager'
import SeedPhraseManager from '../components/SeedPhraseManager'
import WithdrawalManager from '../components/WithdrawalManager'
import AccountOverview from '../components/AccountOverview'
import usePrivacyPoolsForm from '../hooks/usePrivacyPoolsForm'

const PrivacyPoolsScreen = () => {
  const { t } = useTranslation()
  const { navigate } = useNavigation()
  const { dispatch } = useBackgroundService()
  const { accountsOps } = useActivityControllerState()
  const { isActionWindow } = getUiType()

  const {
    message,
    poolInfo,
    seedPhrase,
    hasProceeded,
    poolAccounts,
    isGenerating,
    depositAmount,
    targetAddress,
    accountService,
    withdrawalAmount,
    isLoadingAccount,
    showAddedToBatch,
    estimationModalRef,
    selectedPoolAccount,
    signAccountOpController,
    latestBroadcastedAccountOp,
    handleDeposit,
    handleRagequit,
    handleWithdrawal,
    handleUpdateForm,
    handleLoadAccount,
    isRagequitLoading,
    closeEstimationModal,
    handleSelectedAccount,
    handleGenerateSeedPhrase
  } = usePrivacyPoolsForm()

  const isTopUp = false

  const submittedAccountOp = useMemo(() => {
    if (!accountsOps.privacyPools || !latestBroadcastedAccountOp?.signature) return

    return accountsOps.privacyPools.result.items.find(
      (accOp) => accOp.signature === latestBroadcastedAccountOp?.signature
    )
  }, [accountsOps.privacyPools, latestBroadcastedAccountOp?.signature])

  const navigateOut = useCallback(() => {
    if (isActionWindow) {
      dispatch({
        type: 'CLOSE_SIGNING_ACTION_WINDOW',
        params: {
          type: 'transfer'
        }
      })
    } else {
      navigate(ROUTES.dashboard)
    }

    dispatch({
      type: 'PRIVACY_POOLS_CONTROLLER_UNLOAD_SCREEN'
    })
  }, [dispatch, navigate])

  const { sessionHandler, onPrimaryButtonPress } = useTrackAccountOp({
    address: latestBroadcastedAccountOp?.accountAddr,
    chainId: latestBroadcastedAccountOp?.chainId,
    sessionId: 'privacyPools',
    submittedAccountOp,
    navigateOut
  })

  const explorerLink = useMemo(() => {
    if (!submittedAccountOp) return

    const { chainId, identifiedBy, txnId } = submittedAccountOp

    if (!chainId || !identifiedBy || !txnId) return

    return `https://explorer.ambire.com/${getBenzinUrlParams({ chainId, txnId, identifiedBy })}`
  }, [submittedAccountOp])

  const displayedView: 'transfer' | 'batch' | 'track' = useMemo(() => {
    if (showAddedToBatch) return 'batch'

    if (latestBroadcastedAccountOp) return 'track'

    return 'transfer'
  }, [latestBroadcastedAccountOp, showAddedToBatch])

  const onBack = useCallback(() => {
    navigate(ROUTES.dashboard)
  }, [navigate])

  const updateController = useCallback(
    (params: { signingKeyAddr?: Key['addr']; signingKeyType?: Key['type'] }) => {
      dispatch({
        type: 'PRIVACY_POOLS_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE',
        params
      })
    },
    [dispatch]
  )

  const handleUpdateStatus = useCallback(
    (status: SigningStatus) => {
      dispatch({
        type: 'PRIVACY_POOLS_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE_STATUS',
        params: {
          status
        }
      })
    },
    [dispatch]
  )

  /**
   * Single click broadcast
   */
  const handleBroadcastAccountOp = useCallback(() => {
    dispatch({
      type: 'MAIN_CONTROLLER_HANDLE_SIGN_AND_BROADCAST_ACCOUNT_OP',
      params: {
        updateType: 'PrivacyPools'
      }
    })
  }, [dispatch])

  useEffect(() => {
    // Optimization: Don't apply filtration if we don't have a recent broadcasted account op
    if (!latestBroadcastedAccountOp?.accountAddr || !latestBroadcastedAccountOp?.chainId) return

    sessionHandler.initSession()

    return () => {
      sessionHandler.killSession()
    }
  }, [latestBroadcastedAccountOp?.accountAddr, latestBroadcastedAccountOp?.chainId, sessionHandler])

  useEffect(() => {
    return () => {
      dispatch({ type: 'PRIVACY_POOLS_CONTROLLER_UNLOAD_SCREEN' })
    }
  }, [dispatch])

  if (displayedView === 'track') {
    return (
      <TrackProgress
        onPrimaryButtonPress={onPrimaryButtonPress}
        secondaryButtonText={t('Add more')}
        handleClose={() => {
          dispatch({
            type: 'PRIVACY_POOLS_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP'
          })
        }}
      >
        {submittedAccountOp?.status === AccountOpStatus.BroadcastedButNotConfirmed && (
          <InProgress title={isTopUp ? t('Confirming your top-up') : t('Confirming your transfer')}>
            <Text fontSize={16} weight="medium" appearance="secondaryText">
              {t('Almost there!')}
            </Text>
          </InProgress>
        )}
        {(submittedAccountOp?.status === AccountOpStatus.Success ||
          submittedAccountOp?.status === AccountOpStatus.UnknownButPastNonce) && (
          <Completed
            title={isTopUp ? t('Top up ready!') : t('Transfer done!')}
            titleSecondary={
              isTopUp
                ? t('You can now use your gas tank')
                : t('{{symbol}} delivered!', {
                    symbol: /* latestBroadcastedToken?.symbol || */ 'Token'
                  })
            }
            explorerLink={explorerLink}
            openExplorerText="View Transfer"
          />
        )}
        {/*
            Note: It's very unlikely for Transfer or Top-Up to fail. That's why we show a predefined error message.
            If it does fail, we need to retrieve the broadcast error from the main controller and display it here.
          */}
        {(submittedAccountOp?.status === AccountOpStatus.Failure ||
          submittedAccountOp?.status === AccountOpStatus.Rejected ||
          submittedAccountOp?.status === AccountOpStatus.BroadcastButStuck) && (
          <Failed
            title={t('Something went wrong!')}
            errorMessage={
              isTopUp
                ? t(
                    'Unable to top up the Gas tank. Please try again later or contact Ambire support.'
                  )
                : t(
                    "We couldn't complete your transfer. Please try again later or contact Ambire support."
                  )
            }
          />
        )}
      </TrackProgress>
    )
  }

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

      <Estimation
        updateType="PrivacyPools"
        estimationModalRef={estimationModalRef}
        closeEstimationModal={closeEstimationModal}
        updateController={updateController}
        handleUpdateStatus={handleUpdateStatus}
        handleBroadcastAccountOp={handleBroadcastAccountOp}
        hasProceeded={!!hasProceeded}
        signAccountOpController={signAccountOpController || null}
      />
    </Wrapper>
  )
}

export default React.memo(PrivacyPoolsScreen)
