import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useLocation } from 'react-router-dom'

import { SigningStatus } from '@ambire-common/controllers/signAccountOp/signAccountOp'
import { Key } from '@ambire-common/interfaces/keystore'
import { AccountOpStatus } from '@ambire-common/libs/accountOp/types'
import BackButton from '@common/components/BackButton'
// import Text from '@common/components/Text'
import KohakuLogo from '@common/components/HokahuLogo'
import useNavigation from '@common/hooks/useNavigation'
import useToast from '@common/hooks/useToast'
// import { ROUTES } from '@common/modules/router/constants/common'
import useActivityControllerState from '@web/hooks/useActivityControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useRailgunControllerState from '@web/hooks/useRailgunControllerState'
import Estimation from '@web/modules/sign-account-op/components/OneClick/Estimation'
// import TrackProgress from '@web/modules/sign-account-op/components/OneClick/TrackProgress'
import Completed from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/Completed'
import Failed from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/Failed'
// import InProgress from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/InProgress'
import useTrackAccountOp from '@web/modules/sign-account-op/hooks/OneClick/useTrackAccountOp'
import DepositForm from '@web/modules/PPv1/deposit/components/DepositForm/DepositForm'
import Buttons from '@web/modules/PPv1/deposit/components/Buttons'
import useDepositForm from '@web/hooks/useDepositForm'
import { getUiType } from '@web/utils/uiType'
import flexbox from '@common/styles/utils/flexbox'
import { Content } from '@web/components/TransactionsScreen'
import { TokenResult } from '@ambire-common/libs/portfolio'
import { Form, Wrapper } from '../components/TransactionsScreen'
// import Button from '@common/components/Button'
// import { SubmittedAccountOp } from '@ambire-common/libs/accountOp/submittedAccountOp'

const { isActionWindow } = getUiType()

const TERMINAL_STATUSES = [
  AccountOpStatus.Success,
  AccountOpStatus.UnknownButPastNonce,
  AccountOpStatus.Failure,
  AccountOpStatus.Rejected,
  AccountOpStatus.BroadcastButStuck
]

function TransferScreen() {
  const hasRefreshedAccountRef = useRef(false)
  const { dispatch } = useBackgroundService()
  const { navigate, dashGoBack } = useNavigation()
  const location = useLocation()
  const { t } = useTranslation()
  const { addToast } = useToast()
  const defaultToken = ((location.state as any)?.token as TokenResult) ?? null

  const { accountsOps } = useActivityControllerState()

  const {
    chainId,
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
    resetForm,
    refreshPrivateAccount,
    loadPrivateAccount,
    privacyProvider,
    isReady,
    selectedToken: depositFormSelectedToken,
    supportedAssets
  } = useDepositForm()

  const selectedToken = depositFormSelectedToken

  // True when the broadcasted op was already in a terminal state at mount — i.e.
  // we're returning after a finished shield. Used to show the deposit form instead
  // of the stale success screen until the op is cleared (below).
  const hasStaleTerminalOpRef = useRef(
    !!(
      latestBroadcastedAccountOp?.status &&
      TERMINAL_STATUSES.includes(latestBroadcastedAccountOp.status)
    )
  )

  const submittedAccountOp = useMemo(() => {
    // Ignore a leftover terminal op from a previous shield so its success view
    // doesn't show on return; the mount effect below clears it, and once the op
    // changes (new shield) this memo recomputes with the flag already reset.
    if (hasStaleTerminalOpRef.current) return
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

  const navigateOut = useCallback(async () => {
    if (isActionWindow) {
      dispatch({
        type: 'CLOSE_SIGNING_ACTION_WINDOW',
        params: {
          type: 'transfer'
        }
      })
    } else {
      dashGoBack()
    }

    dispatch({
      type: 'RAILGUN_V2_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP'
    })
    dispatch({
      type: 'PRIVACY_POOLS_CONTROLLER_UNLOAD_SCREEN'
    })
  }, [dispatch, navigate, privacyProvider])

  // Use 'transfer' sessionId for Railgun, 'privacyPools' for Privacy Pools
  const sessionId = useMemo(() => {
    return privacyProvider === 'railgun' ? 'transfer' : 'privacyPools'
  }, [privacyProvider])

  const { sessionHandler } = useTrackAccountOp({
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

  // On mount, clear a leftover terminal op so a returning user lands on a fresh
  // deposit form rather than the previous shield's success view.
  useEffect(() => {
    if (
      latestBroadcastedAccountOp?.status &&
      TERMINAL_STATUSES.includes(latestBroadcastedAccountOp.status)
    ) {
      dispatch({ type: 'RAILGUN_V2_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Once the op is cleared, drop the stale flag so the next shield shows progress.
  useEffect(() => {
    if (!latestBroadcastedAccountOp) {
      hasStaleTerminalOpRef.current = false
    }
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

      dispatch({
        type: 'PRIVACY_POOLS_CONTROLLER_RESET_FORM'
      })

      // Reset hasProceeded for the currently selected controller when navigating back
      dispatch({
        type: 'PRIVACY_POOLS_CONTROLLER_HAS_USER_PROCEEDED',
        params: {
          proceeded: false
        }
      })
      dispatch({
        type: 'RAILGUN_V2_CONTROLLER_HAS_USER_PROCEEDED',
        params: {
          proceeded: false
        }
      })
    }
  }, [dispatch])

  const handleBroadcastAccountOp = useCallback(() => {
    const updateType = privacyProvider === 'railgun' ? 'RailgunV2' : 'PrivacyPoolsV1'
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
          ? 'RAILGUN_V2_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE_STATUS'
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
          ? 'RAILGUN_V2_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE'
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
      return isReady && !validationFormMsgs.amount.message
    }

    console.log('DEBUG: validationFormMsgs:', validationFormMsgs.amount)
    // For Railgun, just check deposit amount
    return !validationFormMsgs.amount.message
  }, [
    depositAmount,
    isReady,
    isLoading,
    isAccountLoaded,
    privacyProvider,
    validationFormMsgs.amount
  ])

  const onBack = useCallback(() => {
    dashGoBack()
  }, [navigate, dispatch])

  const headerTitle = t('Shield Funds')

  const isPendingBroadcast = !!latestBroadcastedAccountOp && !submittedAccountOp

  const hasResult = !!submittedAccountOp

  const isResultPending =
    isPendingBroadcast || submittedAccountOp?.status === AccountOpStatus.BroadcastedButNotConfirmed

  const proceedBtnText = useMemo(() => {
    if (
      isPendingBroadcast ||
      submittedAccountOp?.status === AccountOpStatus.BroadcastedButNotConfirmed
    )
      return t('Shielding...')

    if (hasResult) return t('Shield more funds')

    if (isLoading && !isAccountLoaded && privacyProvider === 'privacy-pools')
      return t('Loading account...')

    if (displayedView === 'track') return t('Shielding...')

    return t('Shield funds')
  }, [
    hasResult,
    isPendingBroadcast,
    submittedAccountOp?.status,
    isLoading,
    privacyProvider,
    isAccountLoaded,
    displayedView,
    t
  ])

  const resetScreen = useCallback(() => {
    if (
      submittedAccountOp &&
      (submittedAccountOp.status === AccountOpStatus.Success ||
        submittedAccountOp.status === AccountOpStatus.UnknownButPastNonce)
    ) {
      dispatch({
        type: 'ACTIVITY_CONTROLLER_HIDE_BANNER',
        params: { ...submittedAccountOp, addr: submittedAccountOp.accountAddr }
      })
    }

    dispatch({
      type: 'RAILGUN_V2_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP'
    })
    // Tear down the previous shield's sign-account-op so the next shield's
    // syncSignAccountOp doesn't early-return on a stale controller.
    dispatch({ type: 'RAILGUN_V2_CONTROLLER_DESTROY_SIGN_ACCOUNT_OP' })

    dispatch({ type: 'PRIVACY_POOLS_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP' })
    dispatch({ type: 'PRIVACY_POOLS_CONTROLLER_UNLOAD_SCREEN' })
    dispatch({ type: 'PRIVACY_POOLS_CONTROLLER_RESET_FORM' })

    // Reset hasProceeded for the currently selected controller
    // to prevent double-click issue when depositing again
    dispatch({
      type: 'PRIVACY_POOLS_CONTROLLER_HAS_USER_PROCEEDED',
      params: {
        proceeded: false
      }
    })
    dispatch({
      type: 'RAILGUN_V2_CONTROLLER_HAS_USER_PROCEEDED',
      params: {
        proceeded: false
      }
    })
    resetForm()
  }, [submittedAccountOp, dispatch, resetForm])


  const buttons = useMemo(() => {
    return (
      <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
        <BackButton
          onPress={hasResult ? navigateOut : onBack}
          withIcon={false}
          text={hasResult ? t('Close') : undefined}
        />
        <Buttons
          handleSubmitForm={hasResult ? resetScreen : handleDeposit}
          proceedBtnText={proceedBtnText}
          proceedIcon={<KohakuLogo width={20} style={{ marginRight: 16 }} />}
          isNotReadyToProceed={isResultPending ? true : hasResult ? false : !isTransferFormValid}
          isLoading={
            isResultPending ||
            (privacyProvider === 'privacy-pools' && !hasResult ? isLoading : false)
          }
          signAccountOpErrors={[]}
          networkUserRequests={[]}
        />
      </View>
    )
  }, [
    onBack,
    navigateOut,
    handleDeposit,
    resetScreen,
    proceedBtnText,
    isTransferFormValid,
    isLoading,
    hasResult,
    isResultPending,
    isPendingBroadcast,
    privacyProvider,
    t
  ])

  return (
    <Wrapper
      title={headerTitle}
      description={t('Move public tokens into your private account')}
      handleGoBack={onBack}
      buttons={null}
      // buttons={buttons}
    >
      <Content buttons={buttons}>
        <Form>
          {(!hasResult || isResultPending) && (
            <DepositForm
              poolAvailable={isReady}
              depositAmount={depositAmount}
              supportedTokens={supportedAssets}
              selectedToken={selectedToken}
              defaultToken={defaultToken}
              amountErrorMessage={validationFormMsgs.amount.message || ''}
              handleUpdateForm={handleUpdateForm}
              chainId={BigInt(chainId)}
              privacyProvider={privacyProvider}
              disabledForm={isResultPending}
            />
          )}
          {(submittedAccountOp?.status === AccountOpStatus.Success ||
            submittedAccountOp?.status === AccountOpStatus.UnknownButPastNonce) &&
            isMatchingDeposit && (
              <Completed
                title={t('Shield complete!')}
                titleSecondary={t(
                  `${selectedToken?.symbol || 'Token'} deposited to privacy protocol!`
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
        </Form>
      </Content>

      {!latestBroadcastedAccountOp && (
        <Estimation
          updateType={privacyProvider === 'railgun' ? 'RailgunV2' : 'PrivacyPoolsV1'}
          estimationModalRef={estimationModalRef}
          closeEstimationModal={closeEstimationModal}
          updateController={updateController}
          handleUpdateStatus={handleUpdateStatus}
          handleBroadcastAccountOp={handleBroadcastAccountOp}
          hasProceeded={!!hasProceeded}
          signAccountOpController={signAccountOpController || null}
        />
      )}
    </Wrapper>
  )
}

export default React.memo(TransferScreen)
