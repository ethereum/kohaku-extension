import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AccountOpStatus } from '@ambire-common/libs/accountOp/types'
import { getBenzinUrlParams } from '@ambire-common/utils/benzin'
import Text from '@common/components/Text'
import useNavigation from '@common/hooks/useNavigation'
import { ROUTES, WEB_ROUTES } from '@common/modules/router/constants/common'
import { Content, Wrapper } from '@web/components/TransactionsScreen'
import useActivityControllerState from '@web/hooks/useActivityControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useTransferControllerState from '@web/hooks/useTransferControllerState'
import BatchAdded from '@web/modules/sign-account-op/components/OneClick/BatchModal/BatchAdded'
import TrackProgress from '@web/modules/sign-account-op/components/OneClick/TrackProgress'
import Completed from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/Completed'
import Failed from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/Failed'
import InProgress from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/InProgress'
import useTrackAccountOp from '@web/modules/sign-account-op/hooks/OneClick/useTrackAccountOp'
import { getUiType } from '@web/utils/uiType'
import AddChainScreen from '../components/ImportForm'

const { isActionWindow } = getUiType()

const ImportScreen = ({ isTopUpScreen }: { isTopUpScreen?: boolean }) => {
  const { dispatch } = useBackgroundService()
  const { state } = useTransferControllerState()
  const { isTopUp, latestBroadcastedAccountOp, latestBroadcastedToken } = state

  const { navigate } = useNavigation()
  const { t } = useTranslation()

  const { accountsOps } = useActivityControllerState()

  const [showAddedToBatch, setShowAddedToBatch] = useState(false)

  const submittedAccountOp = useMemo(() => {
    if (!accountsOps.transfer || !latestBroadcastedAccountOp?.signature) return

    return accountsOps.transfer.result.items.find(
      (accOp) => accOp.signature === latestBroadcastedAccountOp.signature
    )
  }, [accountsOps.transfer, latestBroadcastedAccountOp?.signature])

  const navigateOut = useCallback(() => {
    if (isActionWindow) {
      dispatch({
        type: 'CLOSE_SIGNING_ACTION_WINDOW',
        params: {
          type: 'transfer'
        }
      })
    } else {
      navigate(WEB_ROUTES.dashboard)
    }

    dispatch({
      type: 'TRANSFER_CONTROLLER_RESET_FORM'
    })
  }, [dispatch, navigate])

  const { sessionHandler, onPrimaryButtonPress } = useTrackAccountOp({
    address: latestBroadcastedAccountOp?.accountAddr,
    chainId: latestBroadcastedAccountOp?.chainId,
    sessionId: 'transfer',
    submittedAccountOp,
    navigateOut
  })

  const explorerLink = useMemo(() => {
    if (!submittedAccountOp) return

    const { chainId, identifiedBy, txnId } = submittedAccountOp

    if (!chainId || !identifiedBy || !txnId) return

    return `https://explorer.ambire.com/${getBenzinUrlParams({ chainId, txnId, identifiedBy })}`
  }, [submittedAccountOp])

  useEffect(() => {
    // Optimization: Don't apply filtration if we don't have a recent broadcasted account op
    if (!latestBroadcastedAccountOp?.accountAddr || !latestBroadcastedAccountOp?.chainId) return

    sessionHandler.initSession()

    return () => {
      sessionHandler.killSession()
    }
  }, [latestBroadcastedAccountOp?.accountAddr, latestBroadcastedAccountOp?.chainId, sessionHandler])

  const displayedView: 'transfer' | 'batch' | 'track' = useMemo(() => {
    if (showAddedToBatch) return 'batch'

    if (latestBroadcastedAccountOp) return 'track'

    return 'transfer'
  }, [latestBroadcastedAccountOp, showAddedToBatch])

  // When navigating to another screen internally in the extension, we unload the TransferController
  // to ensure that no estimation or SignAccountOp logic is still running.
  // If the screen is closed entirely, the clean-up is handled by the port.onDisconnect callback in the background.
  useEffect(() => {
    return () => {
      dispatch({ type: 'TRANSFER_CONTROLLER_UNLOAD_SCREEN' })
    }
  }, [dispatch])

  useEffect(() => {
    dispatch({
      type: 'TRANSFER_CONTROLLER_UPDATE_FORM',
      // `isTopUp` should be sent as a boolean.
      // Sending it as undefined will not correctly reflect the state of the transfer controller.
      params: { formValues: { isTopUp: !!isTopUpScreen } }
    })
  }, [dispatch, isTopUpScreen])

  const headerTitle = 'Import Secret Note'

  const handleGoBackPress = useCallback(() => {
    navigate(ROUTES.pp2Home)
  }, [navigate])

  const onBatchAddedPrimaryButtonPress = useCallback(() => {
    dispatch({
      type: 'TRANSFER_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP'
    })
    navigate(WEB_ROUTES.dashboard)
  }, [dispatch, navigate])

  const onBatchAddedSecondaryButtonPress = useCallback(() => {
    dispatch({
      type: 'TRANSFER_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP'
    })
    setShowAddedToBatch(false)
  }, [dispatch, setShowAddedToBatch])

  if (displayedView === 'track') {
    return (
      <TrackProgress
        onPrimaryButtonPress={onPrimaryButtonPress}
        secondaryButtonText={t('Add more')}
        handleClose={() => {
          dispatch({
            type: 'TRANSFER_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP'
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
                    symbol: latestBroadcastedToken?.symbol || 'Token'
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

  if (displayedView === 'batch') {
    return (
      <BatchAdded
        title={isTopUp ? t('Top Up Gas Tank') : t('Send')}
        primaryButtonText={t('Open dashboard')}
        secondaryButtonText={t('Add more')}
        onPrimaryButtonPress={onBatchAddedPrimaryButtonPress}
        onSecondaryButtonPress={onBatchAddedSecondaryButtonPress}
      />
    )
  }

  return (
    <Wrapper title={headerTitle} handleGoBack={handleGoBackPress} buttons={<>,</>}>
      <Content buttons={<> </>}>
        <AddChainScreen />
      </Content>
    </Wrapper>
  )
}

export default React.memo(ImportScreen)
