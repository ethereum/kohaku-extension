import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { SigningStatus } from '@ambire-common/controllers/signAccountOp/signAccountOp'
import { AddressStateOptional } from '@ambire-common/interfaces/domains'
import { Key } from '@ambire-common/interfaces/keystore'
import { AccountOpStatus } from '@ambire-common/libs/accountOp/types'
import { getBenzinUrlParams } from '@ambire-common/utils/benzin'

import BackButton from '@common/components/BackButton'
import Text from '@common/components/Text'
import useAddressInput from '@common/hooks/useAddressInput'
import useNavigation from '@common/hooks/useNavigation'
import { ROUTES } from '@common/modules/router/constants/common'

import { Content, Form } from '@web/components/TransactionsScreen'
import useActivityControllerState from '@web/hooks/useActivityControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useSyncedState from '@web/hooks/useSyncedState'
import usePrivacyPoolsControllerState from '@web/hooks/usePrivacyPoolsControllerState'
import Buttons from '@web/modules/PPv1/deposit/components/Buttons'
import Estimation from '@web/modules/sign-account-op/components/OneClick/Estimation'
import TrackProgress from '@web/modules/sign-account-op/components/OneClick/TrackProgress'
import Completed from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/Completed'
import Failed from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/Failed'
import InProgress from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/InProgress'
import useTrackAccountOp from '@web/modules/sign-account-op/hooks/OneClick/useTrackAccountOp'
import { getUiType } from '@web/utils/uiType'

import { View } from 'react-native'
import flexbox from '@common/styles/utils/flexbox'
import TransferForm from '../components/TransferForm/TransferForm'
import usePrivacyPoolsForm from '../../hooks/usePrivacyPoolsForm'
import { Wrapper } from '../../deposit/components/TransactionsScreen'

const { isActionWindow } = getUiType()

const TransferScreen = () => {
  const hasRefreshedAccountRef = useRef(false)
  const { dispatch } = useBackgroundService()
  const {
    totalApprovedBalance,
    handleUpdateForm,
    handleMultipleWithdrawal,
    refreshPrivateAccount
  } = usePrivacyPoolsForm()
  const {
    validationFormMsgs,
    addressState,
    isRecipientAddressUnknown,
    latestBroadcastedAccountOp,
    latestBroadcastedToken,
    hasProceeded,
    selectedToken,
    amountFieldMode,
    withdrawalAmount,
    amountInFiat,
    programmaticUpdateCounter,
    isRecipientAddressUnknownAgreed,
    signAccountOpController,
    maxAmount,
    relayerQuote,
    updateQuoteStatus,
    shouldTrackLatestBroadcastedAccountOp
  } = usePrivacyPoolsControllerState()

  const { navigate } = useNavigation()
  const { t } = useTranslation()
  const { accountsOps } = useActivityControllerState()

  const controllerAmountFieldValue = amountFieldMode === 'token' ? withdrawalAmount : amountInFiat
  const [amountFieldValue, setAmountFieldValue] = useSyncedState<string>({
    backgroundState: controllerAmountFieldValue,
    updateBackgroundState: (newAmount) => {
      handleUpdateForm({ withdrawalAmount: newAmount })
    },
    forceUpdateOnChangeList: [programmaticUpdateCounter, amountFieldMode]
  })
  const [addressStateFieldValue, setAddressStateFieldValue] = useSyncedState<string>({
    backgroundState: addressState.fieldValue,
    updateBackgroundState: (newAddress: string) => {
      handleUpdateForm({ addressState: { fieldValue: newAddress } })
    },
    forceUpdateOnChangeList: [programmaticUpdateCounter]
  })

  // For privacy pools withdrawals via relayer, we use latestBroadcastedAccountOp directly
  // because these transactions don't go through the normal AccountOp flow and aren't added to ActivityController
  const submittedAccountOp = useMemo(() => {
    // If latestBroadcastedAccountOp exists and has the privacy pools withdrawal flag, use it directly
    if (latestBroadcastedAccountOp?.meta?.isPrivacyPoolsWithdrawal) {
      return latestBroadcastedAccountOp as any
    }

    // Otherwise, look for it in the activity controller (for normal transactions)
    if (!accountsOps.privacyPools || !latestBroadcastedAccountOp?.signature) return

    return accountsOps.privacyPools.result.items.find(
      (accOp) => accOp.signature === latestBroadcastedAccountOp.signature
    )
  }, [accountsOps.privacyPools, latestBroadcastedAccountOp])

  const navigateOut = useCallback(() => {
    if (isActionWindow) {
      dispatch({
        type: 'CLOSE_SIGNING_ACTION_WINDOW',
        params: {
          type: 'transfer'
        }
      })
    } else {
      navigate(ROUTES.pp1Home)
    }

    dispatch({
      type: 'PRIVACY_POOLS_CONTROLLER_RESET_FORM'
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

  useEffect(() => {
    // Optimization: Don't apply filtration if we don't have a recent broadcasted account op
    if (!latestBroadcastedAccountOp?.accountAddr || !latestBroadcastedAccountOp?.chainId) return

    sessionHandler.initSession()

    return () => {
      sessionHandler.killSession()
    }
  }, [latestBroadcastedAccountOp?.accountAddr, latestBroadcastedAccountOp?.chainId, sessionHandler])

  const displayedView: 'transfer' | 'track' = useMemo(() => {
    console.log(
      'DEBUG: shouldTrackLatestBroadcastedAccountOp',
      shouldTrackLatestBroadcastedAccountOp,
      'latestBroadcastedAccountOp',
      latestBroadcastedAccountOp
    )
    // Show tracking screen only if both conditions are met:
    // 1. latestBroadcastedAccountOp is set (transaction was broadcasted)
    // 2. shouldTrackLatestBroadcastedAccountOp is true (controller wants us to show tracking)
    if (latestBroadcastedAccountOp && shouldTrackLatestBroadcastedAccountOp) return 'track'

    return 'transfer'
  }, [latestBroadcastedAccountOp, shouldTrackLatestBroadcastedAccountOp])

  // When navigating to another screen internally in the extension, we unload the TransferController
  // to ensure that no estimation or SignAccountOp logic is still running.
  // If the screen is closed entirely, the clean-up is handled by the port.onDisconnect callback in the background.
  useEffect(() => {
    return () => {
      dispatch({
        type: 'PRIVACY_POOLS_CONTROLLER_UNLOAD_SCREEN'
      })
    }
  }, [dispatch])

  const handleBroadcastAccountOp = useCallback(() => {
    dispatch({
      type: 'PRIVACY_POOLS_CONTROLLER_BROADCAST_WITHDRAWAL'
    })
  }, [dispatch])

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
  const updateController = useCallback(
    (params: { signingKeyAddr?: Key['addr']; signingKeyType?: Key['type'] }) => {
      dispatch({
        type: 'PRIVACY_POOLS_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE',
        params
      })
    },
    [dispatch]
  )

  // Used to resolve ENS, not to update the field value
  const setAddressState = useCallback(
    (newPartialAddressState: AddressStateOptional) => {
      dispatch({
        type: 'PRIVACY_POOLS_CONTROLLER_UPDATE_FORM',
        params: { addressState: newPartialAddressState }
      })
    },
    [dispatch]
  )

  const handleCacheResolvedDomain = useCallback(
    (address: string, domain: string, type: 'ens') => {
      dispatch({
        type: 'DOMAINS_CONTROLLER_SAVE_RESOLVED_REVERSE_LOOKUP',
        params: {
          type,
          address,
          name: domain
        }
      })
    },
    [dispatch]
  )

  const addressInputState = useAddressInput({
    addressState,
    setAddressState,
    overwriteError: !validationFormMsgs.recipientAddress.success
      ? validationFormMsgs.recipientAddress.message
      : '',
    overwriteValidLabel: validationFormMsgs?.recipientAddress.success
      ? validationFormMsgs.recipientAddress.message
      : '',
    handleCacheResolvedDomain
  })

  const { estimationModalRef, closeEstimationModal } = usePrivacyPoolsForm()

  // Close the Estimation modal when transitioning to track view
  useEffect(() => {
    if (displayedView === 'track') {
      closeEstimationModal()
    }
  }, [displayedView, closeEstimationModal])

  const amountErrorMessage = useMemo(() => {
    return validationFormMsgs.amount.message || ''
  }, [validationFormMsgs.amount.message])

  const isTransferFormValid = useMemo(() => {
    return !!(
      amountFieldValue &&
      amountFieldValue !== '0' &&
      selectedToken &&
      relayerQuote &&
      !addressInputState.validation.isError
    )
  }, [amountFieldValue, selectedToken, addressInputState.validation.isError])

  const onBack = useCallback(() => {
    dispatch({
      type: 'PRIVACY_POOLS_CONTROLLER_RESET_FORM'
    })
    navigate(ROUTES.pp1Home)
  }, [navigate, dispatch])

  const headerTitle = t('Private Transfer')
  const formTitle = t('Send')

  const buttons = useMemo(() => {
    return (
      <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
        <BackButton onPress={onBack} />
        <Buttons
          handleSubmitForm={handleMultipleWithdrawal}
          proceedBtnText={t('Send')}
          isNotReadyToProceed={!isTransferFormValid}
          signAccountOpErrors={[]}
          networkUserRequests={[]}
        />
      </View>
    )
  }, [onBack, handleMultipleWithdrawal, isTransferFormValid, t])

  if (displayedView === 'track') {
    return (
      <TrackProgress
        onPrimaryButtonPress={onPrimaryButtonPress}
        handleClose={() => {
          console.log('destroy latest broadcasted account op')
          dispatch({
            type: 'PRIVACY_POOLS_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP'
          })
        }}
      >
        {submittedAccountOp?.status === AccountOpStatus.BroadcastedButNotConfirmed && (
          <InProgress title={t('Confirming your transfer')}>
            <Text fontSize={16} weight="medium" appearance="secondaryText">
              {t('Almost there!')}
            </Text>
          </InProgress>
        )}
        {(submittedAccountOp?.status === AccountOpStatus.Success ||
          submittedAccountOp?.status === AccountOpStatus.UnknownButPastNonce) && (
          <Completed
            title={t('Transfer done!')}
            titleSecondary={t('{{symbol}} delivered!', {
              symbol: latestBroadcastedToken?.symbol || 'Token'
            })}
            explorerLink={explorerLink}
            openExplorerText="View Transfer"
          />
        )}
        {(submittedAccountOp?.status === AccountOpStatus.Failure ||
          submittedAccountOp?.status === AccountOpStatus.Rejected ||
          submittedAccountOp?.status === AccountOpStatus.BroadcastButStuck) && (
          <Failed
            title={t('Something went wrong!')}
            errorMessage={t(
              "We couldn't complete your transfer. Please try again later or contact Ambire support."
            )}
          />
        )}
      </TrackProgress>
    )
  }

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
      })
    }
  }, [submittedAccountOp?.status, refreshPrivateAccount])

  return (
    <Wrapper title={headerTitle} buttons={buttons}>
      <Content buttons={buttons}>
        <Form>
          <TransferForm
            addressInputState={addressInputState}
            amountErrorMessage={amountErrorMessage}
            isRecipientAddressUnknown={isRecipientAddressUnknown}
            formTitle={formTitle}
            amountFieldValue={amountFieldValue}
            setAmountFieldValue={setAmountFieldValue}
            addressStateFieldValue={addressStateFieldValue}
            setAddressStateFieldValue={setAddressStateFieldValue}
            handleUpdateForm={handleUpdateForm}
            selectedToken={selectedToken}
            maxAmount={maxAmount || '0'}
            quoteFee={
              amountFieldValue && relayerQuote?.totalAmountWithFee
                ? parseFloat(relayerQuote.totalAmountWithFee) - parseFloat(amountFieldValue)
                : 0
            }
            amountFieldMode={amountFieldMode}
            amountInFiat={amountInFiat}
            isRecipientAddressUnknownAgreed={isRecipientAddressUnknownAgreed || false}
            addressState={addressState}
            controllerAmount={withdrawalAmount}
            totalApprovedBalance={totalApprovedBalance}
            updateQuoteStatus={updateQuoteStatus}
          />
        </Form>
      </Content>

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

export default React.memo(TransferScreen)
