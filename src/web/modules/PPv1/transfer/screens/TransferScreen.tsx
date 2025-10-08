import React, { useCallback, useEffect, useMemo } from 'react'
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

import { Content, Form, Wrapper } from '@web/components/TransactionsScreen'
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

import TransferForm from '../components/TransferForm/TransferForm'
import usePrivacyPoolsForm from '../../hooks/usePrivacyPoolsForm'

const { isTab, isActionWindow } = getUiType()

const TransferScreen = () => {
  const { dispatch } = useBackgroundService()
  const { handleUpdateForm, handleWithdrawal } = usePrivacyPoolsForm()
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
    tokens
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

  const submittedAccountOp = useMemo(() => {
    if (!accountsOps.privacyPools || !latestBroadcastedAccountOp?.signature) return

    return accountsOps.privacyPools.result.items.find(
      (accOp) => accOp.signature === latestBroadcastedAccountOp.signature
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
      navigate(ROUTES.pp1Home)
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

  useEffect(() => {
    // Optimization: Don't apply filtration if we don't have a recent broadcasted account op
    if (!latestBroadcastedAccountOp?.accountAddr || !latestBroadcastedAccountOp?.chainId) return

    sessionHandler.initSession()

    return () => {
      sessionHandler.killSession()
    }
  }, [latestBroadcastedAccountOp?.accountAddr, latestBroadcastedAccountOp?.chainId, sessionHandler])

  const displayedView: 'transfer' | 'track' = useMemo(() => {
    if (latestBroadcastedAccountOp) return 'track'

    return 'transfer'
  }, [latestBroadcastedAccountOp])

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
      type: 'MAIN_CONTROLLER_HANDLE_SIGN_AND_BROADCAST_ACCOUNT_OP',
      params: {
        updateType: 'PrivacyPools'
      }
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

  const amountErrorMessage = useMemo(() => {
    return validationFormMsgs.amount.message || ''
  }, [validationFormMsgs.amount.message])

  const isTransferFormValid = useMemo(() => {
    return !!(
      amountFieldValue &&
      amountFieldValue !== '0' &&
      selectedToken &&
      !addressInputState.validation.isError
    )
  }, [amountFieldValue, selectedToken, addressInputState.validation.isError])

  const onBack = useCallback(() => {
    navigate(ROUTES.pp1Home)
  }, [navigate])

  const headerTitle = t('Private Transfer')
  const formTitle = t('Send')

  const buttons = useMemo(() => {
    return (
      <>
        {isTab && <BackButton onPress={onBack} />}
        <Buttons
          handleSubmitForm={handleWithdrawal}
          proceedBtnText={t('Send')}
          isNotReadyToProceed={!isTransferFormValid}
          signAccountOpErrors={[]}
          networkUserRequests={[]}
        />
      </>
    )
  }, [onBack, handleWithdrawal, isTransferFormValid, t])

  const handleGoBackPress = useCallback(() => {
    navigate(ROUTES.pp1Home)
  }, [navigate])

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

  return (
    <Wrapper title={headerTitle} handleGoBack={handleGoBackPress} buttons={buttons}>
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
            tokens={tokens || []}
            selectedToken={selectedToken}
            maxAmount={maxAmount || '0'}
            amountFieldMode={amountFieldMode}
            amountInFiat={amountInFiat}
            isRecipientAddressUnknownAgreed={isRecipientAddressUnknownAgreed || false}
            addressState={addressState}
            controllerAmount={withdrawalAmount}
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
