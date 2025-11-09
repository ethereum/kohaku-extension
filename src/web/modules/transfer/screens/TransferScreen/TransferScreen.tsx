import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'
import { useModalize } from 'react-native-modalize'

import { FEE_COLLECTOR } from '@ambire-common/consts/addresses'
import { ActionExecutionType } from '@ambire-common/controllers/actions/actions'
import { SigningStatus } from '@ambire-common/controllers/signAccountOp/signAccountOp'
import { AddressStateOptional } from '@ambire-common/interfaces/domains'
import { Key } from '@ambire-common/interfaces/keystore'
import { isSmartAccount as getIsSmartAccount } from '@ambire-common/libs/account/account'
import { AccountOpStatus } from '@ambire-common/libs/accountOp/types'
import { getBenzinUrlParams } from '@ambire-common/utils/benzin'
import { getAddressFromAddressState } from '@ambire-common/utils/domains'
import InfoIcon from '@common/assets/svg/InfoIcon'
import Alert from '@common/components/Alert'
import BackButton from '@common/components/BackButton'
import BottomSheet from '@common/components/BottomSheet'
import Checkbox from '@common/components/Checkbox'
import DualChoiceModal from '@common/components/DualChoiceModal'
import SkeletonLoader from '@common/components/SkeletonLoader'
import Text from '@common/components/Text'
import useAddressInput from '@common/hooks/useAddressInput'
import useNavigation from '@common/hooks/useNavigation'
import useTheme from '@common/hooks/useTheme'
import useToast from '@common/hooks/useToast'
import { ROUTES, WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { Content, Form, Wrapper } from '@web/components/TransactionsScreen'
import { createTab } from '@web/extension-services/background/webapi/tab'
import useActionsControllerState from '@web/hooks/useActionsControllerState'
import useActivityControllerState from '@web/hooks/useActivityControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useHasGasTank from '@web/hooks/useHasGasTank'
import useRequestsControllerState from '@web/hooks/useRequestsControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import useSyncedState from '@web/hooks/useSyncedState'
import useTransferControllerState from '@web/hooks/useTransferControllerState'
import BatchAdded from '@web/modules/sign-account-op/components/OneClick/BatchModal/BatchAdded'
import Buttons from '@web/modules/sign-account-op/components/OneClick/Buttons'
import Estimation from '@web/modules/sign-account-op/components/OneClick/Estimation'
import TrackProgress from '@web/modules/sign-account-op/components/OneClick/TrackProgress'
import Completed from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/Completed'
import Failed from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/Failed'
import InProgress from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/InProgress'
import useTrackAccountOp from '@web/modules/sign-account-op/hooks/OneClick/useTrackAccountOp'
import GasTankInfoModal from '@web/modules/transfer/components/GasTankInfoModal'
import SendForm from '@web/modules/transfer/components/SendForm/SendForm'
import { getUiType } from '@web/utils/uiType'

const { isPopup, isTab, isActionWindow } = getUiType()

const TransferScreen = ({ isTopUpScreen }: { isTopUpScreen?: boolean }) => {
  const { dispatch } = useBackgroundService()
  const { addToast } = useToast()
  const { state } = useTransferControllerState()
  const {
    isTopUp,
    validationFormMsgs,
    addressState,
    isRecipientHumanizerKnownTokenOrSmartContract,
    isSWWarningVisible,
    isRecipientAddressUnknown,
    isFormValid,
    signAccountOpController,
    latestBroadcastedAccountOp,
    latestBroadcastedToken,
    hasProceeded,
    selectedToken,
    amountFieldMode,
    amount: controllerAmount,
    amountInFiat
  } = state

  const { navigate } = useNavigation()
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { visibleActionsQueue } = useActionsControllerState()
  const { account, portfolio } = useSelectedAccountControllerState()
  const isSmartAccount = account ? getIsSmartAccount(account) : false
  const { ref: sheetRef, open: openBottomSheet, close: closeBottomSheet } = useModalize()
  const { userRequests } = useRequestsControllerState()
  const {
    ref: gasTankSheetRef,
    open: openGasTankInfoBottomSheet,
    close: closeGasTankInfoBottomSheet
  } = useModalize()
  const { accountsOps } = useActivityControllerState()
  const { hasGasTank } = useHasGasTank({ account })
  const recipientMenuClosedAutomatically = useRef(false)

  const [showAddedToBatch, setShowAddedToBatch] = useState(false)

  const controllerAmountFieldValue = amountFieldMode === 'token' ? controllerAmount : amountInFiat
  const [amountFieldValue, setAmountFieldValue] = useSyncedState<string>({
    backgroundState: controllerAmountFieldValue,
    updateBackgroundState: (newAmount) => {
      dispatch({
        type: 'TRANSFER_CONTROLLER_UPDATE_FORM',
        params: { formValues: { amount: newAmount } }
      })
    },
    forceUpdateOnChangeList: [state.programmaticUpdateCounter, state.amountFieldMode]
  })
  const [addressStateFieldValue, setAddressStateFieldValue] = useSyncedState<string>({
    backgroundState: addressState.fieldValue,
    updateBackgroundState: (newAddress: string) => {
      dispatch({
        type: 'TRANSFER_CONTROLLER_UPDATE_FORM',
        params: { formValues: { addressState: { fieldValue: newAddress } } }
      })
    },
    forceUpdateOnChangeList: [state.programmaticUpdateCounter]
  })

  const isLocalStateOutOfSync =
    controllerAmountFieldValue !== amountFieldValue ||
    addressState.fieldValue !== addressStateFieldValue

  const submittedAccountOp = useMemo(() => {
    if (!accountsOps.transfer || !latestBroadcastedAccountOp?.signature) return

    return accountsOps.transfer.result.items.find(
      (accOp) => accOp.signature === latestBroadcastedAccountOp.signature
    )
  }, [accountsOps.transfer, latestBroadcastedAccountOp?.signature])

  const accountUserRequests = useMemo(() => {
    if (!account || !userRequests.length) return []

    return userRequests.filter(
      (r) => r.action.kind === 'calls' && r.meta.accountAddr === account.addr
    )
  }, [userRequests, account])

  const networkUserRequests = useMemo(() => {
    if (!selectedToken || !account || !userRequests.length) return []

    return accountUserRequests.filter((r) => r.meta.chainId === selectedToken.chainId)
  }, [selectedToken, account, userRequests.length, accountUserRequests])

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

  const {
    ref: estimationModalRef,
    open: openEstimationModal,
    close: closeEstimationModal
  } = useModalize()

  const openEstimationModalAndDispatch = useCallback(() => {
    dispatch({
      type: 'TRANSFER_CONTROLLER_HAS_USER_PROCEEDED',
      params: {
        proceeded: true
      }
    })
    openEstimationModal()
  }, [openEstimationModal, dispatch])

  useEffect(() => {
    dispatch({
      type: 'TRANSFER_CONTROLLER_UPDATE_FORM',
      // `isTopUp` should be sent as a boolean.
      // Sending it as undefined will not correctly reflect the state of the transfer controller.
      params: { formValues: { isTopUp: !!isTopUpScreen } }
    })
  }, [dispatch, isTopUpScreen])

  /**
   * Single click broadcast
   */
  const handleBroadcastAccountOp = useCallback(() => {
    dispatch({
      type: 'MAIN_CONTROLLER_HANDLE_SIGN_AND_BROADCAST_ACCOUNT_OP',
      params: {
        updateType: 'Transfer&TopUp'
      }
    })
  }, [dispatch])

  const handleUpdateStatus = useCallback(
    (status: SigningStatus) => {
      dispatch({
        type: 'TRANSFER_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE_STATUS',
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
        type: 'TRANSFER_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE',
        params
      })
    },
    [dispatch]
  )

  // Used to resolve ENS, not to update the field value
  const setAddressState = useCallback(
    (newPartialAddressState: AddressStateOptional) => {
      dispatch({
        type: 'TRANSFER_CONTROLLER_UPDATE_FORM',
        params: { formValues: { addressState: newPartialAddressState } }
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
    overwriteError:
      state?.isInitialized && !validationFormMsgs.recipientAddress.success
        ? validationFormMsgs.recipientAddress.message
        : '',
    overwriteValidLabel: validationFormMsgs?.recipientAddress.success
      ? validationFormMsgs.recipientAddress.message
      : '',
    handleCacheResolvedDomain
  })

  /**
   * True if the user has pending user requests and there is no amount set in the form.
   * Used to allow the user to open the SignAccountOp window to sign the requests.
   */
  const isSendingBatch =
    accountUserRequests.length > 0 && !state.amount && visibleActionsQueue.length > 0

  const submitButtonText = useMemo(() => {
    const count = isSendingBatch ? accountUserRequests.length : networkUserRequests.length

    if (!count) {
      return t('Send')
    }

    return t('Send ({{count}})', {
      count: isSendingBatch ? accountUserRequests.length : networkUserRequests.length
    })
  }, [accountUserRequests.length, isSendingBatch, networkUserRequests.length, t])

  const isTransferFormValid = useMemo(() => {
    if (isSendingBatch) return true

    return !!(isTopUp ? isFormValid : isFormValid && !addressInputState.validation.isError)
  }, [addressInputState.validation.isError, isFormValid, isSendingBatch, isTopUp])

  const onBack = useCallback(() => {
    dispatch({
      type: 'TRANSFER_CONTROLLER_RESET_FORM'
    })
    navigate(ROUTES.dashboard)
  }, [navigate, dispatch])

  const resetTransferForm = useCallback(() => {
    dispatch({
      type: 'TRANSFER_CONTROLLER_RESET_FORM'
    })
    recipientMenuClosedAutomatically.current = false
  }, [dispatch])

  const addTransaction = useCallback(
    (actionExecutionType: ActionExecutionType) => {
      if (isSendingBatch) {
        const action = visibleActionsQueue.find((a) => a.type === 'accountOp')

        if (!action) {
          addToast(
            t('Failed to open batch. If this error persists please reject it from the dashboard.'),
            { type: 'error' }
          )
          return
        }

        dispatch({
          type: 'ACTIONS_CONTROLLER_SET_CURRENT_ACTION_BY_ID',
          params: {
            actionId: action.id
          }
        })
        return
      }

      if (isFormValid && state.selectedToken) {
        // In the case of a Batch, we show an info modal explaining what Batching is.
        // We provide an option to skip this modal next time.
        if (actionExecutionType === 'queue' && !state.shouldSkipTransactionQueuedModal) {
          openBottomSheet()
        }

        // Proceed in OneClick txn
        if (actionExecutionType === 'open-action-window') {
          // one click mode opens signAccountOp if more than 1 req in batch
          if (networkUserRequests.length > 0) {
            dispatch({
              type: 'REQUESTS_CONTROLLER_BUILD_REQUEST',
              params: {
                type: 'transferRequest',
                params: {
                  amount: state.amount,
                  selectedToken: state.selectedToken,
                  recipientAddress: isTopUp
                    ? FEE_COLLECTOR
                    : getAddressFromAddressState(addressState),
                  actionExecutionType
                }
              }
            })
            window.close()
          } else {
            openEstimationModalAndDispatch()
          }
          return
        }

        // Batch
        dispatch({
          type: 'REQUESTS_CONTROLLER_BUILD_REQUEST',
          params: {
            type: 'transferRequest',
            params: {
              amount: state.amount,
              selectedToken: state.selectedToken,
              recipientAddress: isTopUp ? FEE_COLLECTOR : getAddressFromAddressState(addressState),
              actionExecutionType
            }
          }
        })

        // If the Batch modal is already skipped, we show the success batch page.
        if (state.shouldSkipTransactionQueuedModal) {
          setShowAddedToBatch(true)
        }

        resetTransferForm()
      }
    },
    [
      isSendingBatch,
      isFormValid,
      state.selectedToken,
      state.shouldSkipTransactionQueuedModal,
      state.amount,
      visibleActionsQueue,
      dispatch,
      addToast,
      t,
      isTopUp,
      addressState,
      resetTransferForm,
      openBottomSheet,
      networkUserRequests.length,
      openEstimationModalAndDispatch
    ]
  )

  const handleGasTankInfoPressed = useCallback(
    () => openGasTankInfoBottomSheet(),
    [openGasTankInfoBottomSheet]
  )

  const gasTankLabelWithInfo = useMemo(() => {
    return (
      <View style={[flexbox.directionRow, flexbox.flex1, flexbox.alignCenter]}>
        <Text
          fontSize={20}
          weight="medium"
          appearance="primaryText"
          numberOfLines={1}
          style={spacings.mrMi}
        >
          {t('Top Up Gas Tank')}
        </Text>
        <Pressable onPress={handleGasTankInfoPressed}>
          <InfoIcon width={20} height={20} />
        </Pressable>
      </View>
    )
  }, [handleGasTankInfoPressed, t])

  // Title shown in BottomSheet header
  const headerTitle = useMemo(
    () => (state.isTopUp ? gasTankLabelWithInfo : t('Send')),
    [state.isTopUp, gasTankLabelWithInfo, t]
  )

  // Title shown before SendToken component
  const formTitle = useMemo(() => {
    if (state.isTopUp) {
      if (isPopup) {
        return t('Top Up')
      }

      return gasTankLabelWithInfo
    }

    return t('Send')
  }, [state.isTopUp, t, gasTankLabelWithInfo])

  const buttons = useMemo(() => {
    return (
      <>
        {isTab && <BackButton onPress={onBack} />}
        <Buttons
          handleSubmitForm={(isOneClickMode) =>
            addTransaction(isOneClickMode ? 'open-action-window' : 'queue')
          }
          proceedBtnText={submitButtonText}
          isBatchDisabled={isSendingBatch}
          isNotReadyToProceed={!isTransferFormValid}
          signAccountOpErrors={[]}
          networkUserRequests={networkUserRequests}
          isLocalStateOutOfSync={isLocalStateOutOfSync}
        />
      </>
    )
  }, [
    onBack,
    submitButtonText,
    isSendingBatch,
    isTransferFormValid,
    networkUserRequests,
    isLocalStateOutOfSync,
    addTransaction
  ])

  const handleGoBackPress = useCallback(() => {
    dispatch({
      type: 'TRANSFER_CONTROLLER_RESET_FORM'
    })
    navigate(ROUTES.dashboard)
  }, [navigate, dispatch])

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
                    'Unable to top up the Gas tank. Please try again later or contact Kokaku support.'
                  )
                : t(
                    "We couldn't complete your transfer. Please try again later or contact Kokaku support."
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
    <Wrapper title={headerTitle} handleGoBack={handleGoBackPress} buttons={buttons}>
      <Content buttons={buttons}>
        {state?.isInitialized ? (
          <Form>
            <SendForm
              addressInputState={addressInputState}
              isSmartAccount={isSmartAccount}
              hasGasTank={hasGasTank}
              amountErrorMessage={validationFormMsgs.amount.message || ''}
              isRecipientAddressUnknown={isRecipientAddressUnknown}
              isRecipientHumanizerKnownTokenOrSmartContract={
                isRecipientHumanizerKnownTokenOrSmartContract
              }
              isSWWarningVisible={isSWWarningVisible}
              recipientMenuClosedAutomaticallyRef={recipientMenuClosedAutomatically}
              formTitle={formTitle}
              amountFieldValue={amountFieldValue}
              setAmountFieldValue={setAmountFieldValue}
              addressStateFieldValue={addressStateFieldValue}
              setAddressStateFieldValue={setAddressStateFieldValue}
            />
            {isTopUp && !hasGasTank && (
              <View style={spacings.ptLg}>
                <Alert
                  type="warning"
                  title={
                    <Trans>
                      The Gas Tank is exclusively available for Smart Accounts. It lets you pre-pay
                      for network fees using stable coins and other tokens and use the funds on any
                      chain.{' '}
                      <Pressable
                        onPress={async () => {
                          try {
                            await createTab(
                              'https://help.ambire.com/hc/en-us/articles/5397969913884-What-is-the-Gas-Tank'
                            )
                          } catch {
                            addToast("Couldn't open link", { type: 'error' })
                          }
                        }}
                      >
                        <Text appearance="warningText" underline>
                          {t('Learn more')}
                        </Text>
                      </Pressable>
                      .
                    </Trans>
                  }
                  isTypeLabelHidden
                />
              </View>
            )}
            {isTopUp && hasGasTank && (
              <View style={spacings.ptLg}>
                <Alert
                  type="warning"
                  title={t('Gas Tank deposits cannot be withdrawn')}
                  isTypeLabelHidden
                />
              </View>
            )}
          </Form>
        ) : (
          <SkeletonLoader
            width={640}
            height={420}
            appearance="primaryBackground"
            style={{ marginLeft: 'auto', marginRight: 'auto' }}
          />
        )}
      </Content>
      <BottomSheet
        id="import-seed-phrase"
        sheetRef={sheetRef}
        closeBottomSheet={closeBottomSheet}
        backgroundColor="secondaryBackground"
        style={{ overflow: 'hidden', width: 496, ...spacings.ph0, ...spacings.pv0 }}
        type="modal"
      >
        <DualChoiceModal
          title={t('Transaction added to batch')}
          description={
            <View>
              <Text style={spacings.mbTy} appearance="secondaryText">
                {t(
                  'You can now add more transactions on this network and send them batched all together for signing.'
                )}
              </Text>
              <Text appearance="secondaryText" style={spacings.mbLg}>
                {t('All pending batch transactions are available on your Dashboard.')}
              </Text>
              <Checkbox
                value={state.shouldSkipTransactionQueuedModal}
                onValueChange={() => {
                  dispatch({
                    type: 'TRANSFER_CONTROLLER_SHOULD_SKIP_TRANSACTION_QUEUED_MODAL',
                    params: {
                      shouldSkip: true
                    }
                  })
                }}
                uncheckedBorderColor={theme.secondaryText}
                label={t("Don't show this modal again")}
                labelProps={{
                  style: {
                    color: theme.secondaryText
                  },
                  weight: 'medium'
                }}
                style={spacings.mb0}
              />
            </View>
          }
          primaryButtonText={t('Got it')}
          primaryButtonTestID="queue-modal-got-it-button"
          onPrimaryButtonPress={() => {
            closeBottomSheet()
            setShowAddedToBatch(true)
          }}
          onCloseIconPress={() => setShowAddedToBatch(true)}
        />
      </BottomSheet>
      <GasTankInfoModal
        id="gas-tank-info"
        sheetRef={gasTankSheetRef}
        closeBottomSheet={closeGasTankInfoBottomSheet}
        onPrimaryButtonPress={closeGasTankInfoBottomSheet}
        portfolio={portfolio}
        account={account}
      />
      <Estimation
        updateType="Transfer&TopUp"
        estimationModalRef={estimationModalRef}
        closeEstimationModal={closeEstimationModal}
        updateController={updateController}
        handleUpdateStatus={handleUpdateStatus}
        handleBroadcastAccountOp={handleBroadcastAccountOp}
        hasProceeded={hasProceeded}
        signAccountOpController={signAccountOpController}
      />
    </Wrapper>
  )
}

export default React.memo(TransferScreen)
