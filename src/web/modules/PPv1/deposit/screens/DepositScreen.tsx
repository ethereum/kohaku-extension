import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useLocation } from 'react-router-dom'

import { SigningStatus } from '@ambire-common/controllers/signAccountOp/signAccountOp'
import { Key } from '@ambire-common/interfaces/keystore'
import { AccountOpStatus } from '@ambire-common/libs/accountOp/types'
import BackButton from '@common/components/BackButton'
import Text from '@common/components/Text'
import useNavigation from '@common/hooks/useNavigation'
import useToast from '@common/hooks/useToast'
import { ROUTES } from '@common/modules/router/constants/common'
import useActivityControllerState from '@web/hooks/useActivityControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import usePrivacyPoolsControllerState from '@web/hooks/usePrivacyPoolsControllerState'
import useRailgunControllerState from '@web/hooks/useRailgunControllerState'
import Estimation from '@web/modules/sign-account-op/components/OneClick/Estimation'
import TrackProgress from '@web/modules/sign-account-op/components/OneClick/TrackProgress'
import Completed from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/Completed'
import Failed from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/Failed'
import InProgress from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/InProgress'
import useTrackAccountOp from '@web/modules/sign-account-op/hooks/OneClick/useTrackAccountOp'
import DepositForm from '@web/modules/PPv1/deposit/components/DepositForm/DepositForm'
import Buttons from '@web/modules/PPv1/deposit/components/Buttons'
import useDepositForm from '@web/hooks/useDepositForm'
import { getUiType } from '@web/utils/uiType'
import flexbox from '@common/styles/utils/flexbox'
import { Content } from '@web/components/TransactionsScreen'
import { TokenResult } from '@ambire-common/libs/portfolio'
import { Form, Wrapper } from '../components/TransactionsScreen'

const { isActionWindow } = getUiType()

function TransferScreen() {
  const hasRefreshedAccountRef = useRef(false)
  const { dispatch } = useBackgroundService()
  const { navigate } = useNavigation()
  const location = useLocation()
  const { t } = useTranslation()
  const { addToast } = useToast()
  const defaultToken = ((location.state as any)?.token as TokenResult) ?? null

  const { accountsOps } = useActivityControllerState()
  const { selectedToken: privacyPoolsSelectedToken } = usePrivacyPoolsControllerState()
  const {
    selectedToken: railgunSelectedToken,
    latestBroadcastedToken: railgunLatestBroadcastedToken
  } = useRailgunControllerState()

  const {
    chainId,
    poolInfo,
    depositAmount,
    hasProceeded,
    estimationModalRef,
    signAccountOpController,
    latestBroadcastedAccountOp,
    isLoading,
    isAccountLoaded,
    validationFormMsgs,
    handleDeposit,
    handleUpdateForm,
    closeEstimationModal,
    refreshPrivateAccount,
    loadPrivateAccount,
    privacyProvider
  } = useDepositForm()

  // Get selectedToken from the appropriate controller based on privacy provider
  // Use latestBroadcastedToken as fallback for railgun since selectedToken might be cleared after deposit
  const selectedToken = useMemo(() => {
    if (privacyProvider === 'railgun') {
      // Prefer latestBroadcastedToken if available (set when deposit is broadcast)
      // Otherwise fall back to selectedToken
      return railgunLatestBroadcastedToken || railgunSelectedToken
    }
    return privacyPoolsSelectedToken
  }, [
    privacyProvider,
    railgunSelectedToken,
    railgunLatestBroadcastedToken,
    privacyPoolsSelectedToken
  ])

  const submittedAccountOp = useMemo(() => {
    if (!latestBroadcastedAccountOp?.signature) return

    // For Railgun, transactions are stored in accountsOps.transfer
    // For Privacy Pools, they're stored in accountsOps.privacyPools
    const accountsOpsSource =
      privacyProvider === 'railgun' ? accountsOps.transfer : accountsOps.privacyPools

    if (!accountsOpsSource) return

    return accountsOpsSource.result.items.find(
      (accOp) => accOp.signature === latestBroadcastedAccountOp?.signature
    )
  }, [
    accountsOps.privacyPools,
    accountsOps.transfer,
    latestBroadcastedAccountOp?.signature,
    privacyProvider
  ])

  const handleGoBack = useCallback(() => {
    navigate(ROUTES.dashboard)
  }, [navigate])

  const navigateOut = useCallback(async () => {
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
      type: 'RAILGUN_CONTROLLER_UNLOAD_SCREEN'
    })
    dispatch({
      type: 'PRIVACY_POOLS_CONTROLLER_UNLOAD_SCREEN'
    })
  }, [dispatch, navigate, privacyProvider])

  // Use 'transfer' sessionId for Railgun, 'privacyPools' for Privacy Pools
  const sessionId = useMemo(() => {
    return privacyProvider === 'railgun' ? 'transfer' : 'privacyPools'
  }, [privacyProvider])

  const { sessionHandler, onPrimaryButtonPress } = useTrackAccountOp({
    address: latestBroadcastedAccountOp?.accountAddr,
    chainId: latestBroadcastedAccountOp?.chainId,
    sessionId,
    submittedAccountOp,
    navigateOut
  })

  // Helper to check if the submittedAccountOp matches a deposit (not a withdrawal)
  const isMatchingDeposit = useMemo(() => {
    if (!submittedAccountOp) return false

    const metaAny = submittedAccountOp.meta as any
    // Withdrawals have meta.isRailgunWithdrawal or meta.isPrivacyPoolsWithdrawal
    // If it has withdrawal meta tags, it's not a deposit
    if (metaAny?.isRailgunWithdrawal || metaAny?.isPrivacyPoolsWithdrawal) {
      return false
    }
    return true
  }, [submittedAccountOp])

  const explorerLink = useMemo(() => {
    if (!submittedAccountOp || !isMatchingDeposit) return

    const { chainId: submittedChainId, identifiedBy, txnId } = submittedAccountOp

    if (!submittedChainId || !identifiedBy || !txnId) return

    return `https://sepolia.etherscan.io/tx/${txnId}`
  }, [submittedAccountOp, isMatchingDeposit])

  useEffect(() => {
    // Optimization: Don't apply filtration if we don't have a recent broadcasted account op
    if (!latestBroadcastedAccountOp?.accountAddr || !latestBroadcastedAccountOp?.chainId) return

    sessionHandler.initSession()

    return () => {
      sessionHandler.killSession()
    }
  }, [latestBroadcastedAccountOp?.accountAddr, latestBroadcastedAccountOp?.chainId, sessionHandler])

  // Refresh private account after deposit success or unknown but past nonce
  useEffect(() => {
    if (
      !hasRefreshedAccountRef.current &&
      (submittedAccountOp?.status === AccountOpStatus.Success ||
        submittedAccountOp?.status === AccountOpStatus.UnknownButPastNonce)
    ) {
      hasRefreshedAccountRef.current = true
      refreshPrivateAccount().catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Failed to refresh private account after deposit:', error)
        addToast('Failed to refresh your privacy account. Please try again.', { type: 'error' })
      })
    }
  }, [submittedAccountOp?.status, refreshPrivateAccount, addToast])

  useEffect(() => {
    return () => {
      hasRefreshedAccountRef.current = false
    }
  }, [])

  const displayedView: 'transfer' | 'track' = useMemo(() => {
    if (latestBroadcastedAccountOp) return 'track'

    return 'transfer'
  }, [latestBroadcastedAccountOp])

  useEffect(() => {
    if (!isAccountLoaded) {
      loadPrivateAccount().catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load private account:', error)
        addToast('Failed to load your privacy account. Please try again.', { type: 'error' })
      })
    }
  }, [isAccountLoaded, loadPrivateAccount, addToast])

  useEffect(() => {
    return () => {
      dispatch({ type: 'PRIVACY_POOLS_CONTROLLER_UNLOAD_SCREEN' })
    }
  }, [dispatch])

  const handleBroadcastAccountOp = useCallback(() => {
    const updateType = privacyProvider === 'railgun' ? 'Railgun' : 'PrivacyPools'
    dispatch({
      type: 'MAIN_CONTROLLER_HANDLE_SIGN_AND_BROADCAST_ACCOUNT_OP',
      params: {
        updateType
      }
    })
  }, [dispatch, privacyProvider])

  const handleUpdateStatus = useCallback(
    (status: SigningStatus) => {
      const actionType =
        privacyProvider === 'railgun'
          ? 'RAILGUN_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE_STATUS'
          : 'PRIVACY_POOLS_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE_STATUS'
      dispatch({
        type: actionType,
        params: {
          status
        }
      })
    },
    [dispatch, privacyProvider]
  )

  const updateController = useCallback(
    (params: { signingKeyAddr?: Key['addr']; signingKeyType?: Key['type'] }) => {
      console.log(
        'DEBUG: updateController called with params:',
        params,
        'privacyProvider:',
        privacyProvider
      )
      const actionType =
        privacyProvider === 'railgun'
          ? 'RAILGUN_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE'
          : 'PRIVACY_POOLS_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE'
      dispatch({
        type: actionType,
        params
      })
    },
    [dispatch, privacyProvider]
  )

  const isTransferFormValid = useMemo(() => {
    if (!depositAmount || depositAmount === '' || depositAmount === '0') return false

    // For Privacy Pools, we need poolInfo; for Railgun, we don't
    if (privacyProvider === 'privacy-pools') {
      if (isLoading || !isAccountLoaded) return false
      return !!poolInfo && !validationFormMsgs.amount.message
    }

    console.log('DEBUG: validationFormMsgs:', validationFormMsgs.amount)
    // For Railgun, just check deposit amount
    return !validationFormMsgs.amount.message
  }, [
    depositAmount,
    poolInfo,
    isLoading,
    isAccountLoaded,
    privacyProvider,
    validationFormMsgs.amount
  ])

  const onBack = useCallback(() => {
    dispatch({
      type: 'PRIVACY_POOLS_CONTROLLER_RESET_FORM'
    })
    dispatch({
      type: 'RAILGUN_CONTROLLER_RESET_FORM'
    })

    navigate(ROUTES.dashboard)

    // Reset hasProceeded for the currently selected controller when navigating back
    dispatch({
      type: 'PRIVACY_POOLS_CONTROLLER_HAS_USER_PROCEEDED',
      params: {
        proceeded: false
      }
    })
    dispatch({
      type: 'RAILGUN_CONTROLLER_HAS_USER_PROCEEDED',
      params: {
        proceeded: false
      }
    })
  }, [navigate, dispatch])

  const headerTitle = t('Deposit')
  const formTitle = t('Deposit')

  const proceedBtnText = useMemo(() => {
    if (isLoading && !isAccountLoaded && privacyProvider === 'privacy-pools')
      return t('Loading account...')
    return t('Deposit')
  }, [isLoading, privacyProvider, isAccountLoaded, t])

  const buttons = useMemo(() => {
    return (
      <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
        <BackButton onPress={onBack} />
        <Buttons
          handleSubmitForm={handleDeposit}
          proceedBtnText={proceedBtnText}
          isNotReadyToProceed={!isTransferFormValid}
          isLoading={privacyProvider === 'privacy-pools' ? isLoading : false}
          signAccountOpErrors={[]}
          networkUserRequests={[]}
        />
      </View>
    )
  }, [onBack, handleDeposit, proceedBtnText, isTransferFormValid, isLoading])

  // Create a wrapper for onPrimaryButtonPress that ensures navigation happens
  // This must be defined before conditional returns to comply with Rules of Hooks
  const handlePrimaryButtonPress = useCallback(() => {
    // If transaction is successful, navigate immediately
    // The banner hiding logic in onPrimaryButtonPress might not work reliably
    if (
      submittedAccountOp &&
      (submittedAccountOp.status === AccountOpStatus.Success ||
        submittedAccountOp.status === AccountOpStatus.UnknownButPastNonce)
    ) {
      // Hide the banner first
      dispatch({
        type: 'ACTIVITY_CONTROLLER_HIDE_BANNER',
        params: {
          ...submittedAccountOp,
          addr: submittedAccountOp.accountAddr
        }
      })

      dispatch({
        type: 'RAILGUN_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP'
      })
      dispatch({
        type: 'PRIVACY_POOLS_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP'
      })

      // Reset hasProceeded for the currently selected controller
      // to prevent double-click issue when depositing again
      dispatch({
        type: 'PRIVACY_POOLS_CONTROLLER_HAS_USER_PROCEEDED',
        params: {
          proceeded: false
        }
      })
      dispatch({
        type: 'RAILGUN_CONTROLLER_HAS_USER_PROCEEDED',
        params: {
          proceeded: false
        }
      })

      // Navigate immediately instead of waiting for the flag
      navigateOut()
    } else {
      // For other states, use the original logic
      onPrimaryButtonPress()
    }
  }, [submittedAccountOp, dispatch, navigateOut, onPrimaryButtonPress, privacyProvider])

  if (displayedView === 'track') {
    return (
      <TrackProgress
        onPrimaryButtonPress={handlePrimaryButtonPress}
        handleClose={() => {
          dispatch({
            type: 'RAILGUN_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP'
          })
          dispatch({
            type: 'PRIVACY_POOLS_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP'
          })

          // Reset hasProceeded for the currently selected controller
          // to prevent double-click issue when depositing again
          dispatch({
            type: 'PRIVACY_POOLS_CONTROLLER_HAS_USER_PROCEEDED',
            params: {
              proceeded: false
            }
          })
          dispatch({
            type: 'RAILGUN_CONTROLLER_HAS_USER_PROCEEDED',
            params: {
              proceeded: false
            }
          })
        }}
      >
        {(submittedAccountOp?.status === AccountOpStatus.BroadcastedButNotConfirmed ||
          ((submittedAccountOp?.status === AccountOpStatus.Success ||
            submittedAccountOp?.status === AccountOpStatus.UnknownButPastNonce) &&
            !isMatchingDeposit)) && (
          <InProgress title={t('Confirming your deposit')}>
            <Text fontSize={16} weight="medium" appearance="secondaryText">
              {t('Almost there!')}
            </Text>
          </InProgress>
        )}
        {(submittedAccountOp?.status === AccountOpStatus.Success ||
          submittedAccountOp?.status === AccountOpStatus.UnknownButPastNonce) &&
          isMatchingDeposit && (
            <Completed
              title={t('Deposit complete!')}
              titleSecondary={t(
                selectedToken?.symbol
                  ? `${selectedToken.symbol} deposited to privacy pool!`
                  : 'Token deposited to privacy pool!'
              )}
              explorerLink={explorerLink}
              openExplorerText="View Deposit"
            />
          )}
        {(submittedAccountOp?.status === AccountOpStatus.Failure ||
          submittedAccountOp?.status === AccountOpStatus.Rejected ||
          submittedAccountOp?.status === AccountOpStatus.BroadcastButStuck) && (
          <Failed
            title={t('Something went wrong!')}
            errorMessage={t(
              "We couldn't complete your deposit. Please try again later or contact Kohaku support."
            )}
          />
        )}
      </TrackProgress>
    )
  }

  return (
    <Wrapper title={headerTitle} handleGoBack={handleGoBack} buttons={buttons}>
      <Content buttons={buttons}>
        <Form>
          <DepositForm
            poolInfo={poolInfo}
            depositAmount={depositAmount}
            selectedToken={selectedToken}
            defaultToken={defaultToken}
            amountErrorMessage={validationFormMsgs.amount.message || ''}
            formTitle={formTitle}
            handleUpdateForm={handleUpdateForm}
            chainId={BigInt(chainId)}
            privacyProvider={privacyProvider}
          />
        </Form>
      </Content>

      <Estimation
        updateType={privacyProvider === 'railgun' ? 'Railgun' : 'PrivacyPools'}
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

export default React.memo(TransferScreen)
