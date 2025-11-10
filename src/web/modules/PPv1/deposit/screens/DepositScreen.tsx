import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

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
import { Form, Wrapper } from '../components/TransactionsScreen'

const { isActionWindow } = getUiType()

function TransferScreen() {
  const hasRefreshedAccountRef = useRef(false)
  const { dispatch } = useBackgroundService()
  const { navigate } = useNavigation()
  const { t } = useTranslation()
  const { addToast } = useToast()

  const { accountsOps } = useActivityControllerState()
  const { selectedToken } = usePrivacyPoolsControllerState()

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
  }, [accountsOps.privacyPools, accountsOps.transfer, latestBroadcastedAccountOp?.signature, privacyProvider])

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

    // Unload the appropriate controller based on privacy provider
    if (privacyProvider === 'railgun') {
      dispatch({
        type: 'RAILGUN_CONTROLLER_UNLOAD_SCREEN'
      })
    } else {
      dispatch({
        type: 'PRIVACY_POOLS_CONTROLLER_UNLOAD_SCREEN'
      })
    }
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

  const explorerLink = useMemo(() => {
    if (!submittedAccountOp) return

    const { chainId: submittedChainId, identifiedBy, txnId } = submittedAccountOp

    if (!submittedChainId || !identifiedBy || !txnId) return

    return `https://sepolia.etherscan.io/tx/${txnId}`
  }, [submittedAccountOp])

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

  // Reset deposit amount when switching between providers
  useEffect(() => {
    handleUpdateForm({ depositAmount: '0' })
  }, [privacyProvider, handleUpdateForm])

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
      console.log('DEBUG: updateController called with params:', params, 'privacyProvider:', privacyProvider)
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
    // For Privacy Pools, we need poolInfo; for Railgun, we don't
    if (privacyProvider === 'privacy-pools') {
      if (isLoading || !isAccountLoaded) return false
      return (
        !!(depositAmount && depositAmount !== '0' && poolInfo) && !validationFormMsgs.amount.message
      )
    }

    console.log('DEBUG: validationFormMsgs:', validationFormMsgs.amount)
    // For Railgun, just check deposit amount
    return (
      !!(depositAmount && depositAmount !== '0') && !validationFormMsgs.amount.message
    )
  }, [depositAmount, poolInfo, isLoading, isAccountLoaded, privacyProvider, validationFormMsgs.amount])

  const onBack = useCallback(() => {
    dispatch({
      type: 'PRIVACY_POOLS_CONTROLLER_RESET_FORM'
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
    if (isLoading && !isAccountLoaded && privacyProvider === 'privacy-pools') return t('Loading account...')
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
      
      // Clean up state before navigating - use the appropriate controller based on provider
      if (privacyProvider === 'railgun') {
        dispatch({
          type: 'RAILGUN_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP'
        })
      } else {
        dispatch({
          type: 'PRIVACY_POOLS_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP'
        })
      }
      
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
          // Clean up the appropriate controller based on provider
          if (privacyProvider === 'railgun') {
            dispatch({
              type: 'RAILGUN_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP'
            })
          } else {
            dispatch({
              type: 'PRIVACY_POOLS_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP'
            })
          }

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
        {submittedAccountOp?.status === AccountOpStatus.BroadcastedButNotConfirmed && (
          <InProgress title={t('Confirming your deposit')}>
            <Text fontSize={16} weight="medium" appearance="secondaryText">
              {t('Almost there!')}
            </Text>
          </InProgress>
        )}
        {(submittedAccountOp?.status === AccountOpStatus.Success ||
          submittedAccountOp?.status === AccountOpStatus.UnknownButPastNonce) && (
          <Completed
            title={t('Deposit complete!')}
            titleSecondary={t('ETH deposited to privacy pool!')}
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
