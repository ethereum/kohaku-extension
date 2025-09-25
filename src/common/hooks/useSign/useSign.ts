import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useModalize } from 'react-native-modalize'

import { EstimationStatus } from '@ambire-common/controllers/estimation/types'
import {
  SignAccountOpController,
  SigningStatus
} from '@ambire-common/controllers/signAccountOp/signAccountOp'
import { Key } from '@ambire-common/interfaces/keystore'
import usePrevious from '@common/hooks/usePrevious'
import useMainControllerState from '@web/hooks/useMainControllerState'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import useLedger from '@web/modules/hardware-wallet/hooks/useLedger'
import { getIsSignLoading } from '@web/modules/sign-account-op/utils/helpers'

type Props = {
  handleUpdateStatus: (status: SigningStatus) => void
  handleBroadcast: () => void
  handleUpdate: (params: { signingKeyAddr?: Key['addr']; signingKeyType?: Key['type'] }) => void
  signAccountOpState: SignAccountOpController | null
  isOneClickSign?: boolean
}

const useSign = ({
  handleUpdateStatus,
  signAccountOpState,
  handleBroadcast,
  handleUpdate,
  isOneClickSign
}: Props) => {
  const { t } = useTranslation()
  const mainState = useMainControllerState()
  const { networks } = useNetworksControllerState()
  const [isChooseSignerShown, setIsChooseSignerShown] = useState(false)
  const [shouldDisplayLedgerConnectModal, setShouldDisplayLedgerConnectModal] = useState(false)
  const prevIsChooseSignerShown = usePrevious(isChooseSignerShown)
  const { isLedgerConnected } = useLedger()
  const [slowRequest, setSlowRequest] = useState<boolean>(false)
  const [slowPaymasterRequest, setSlowPaymasterRequest] = useState<boolean>(true)
  const [acknowledgedWarnings, setAcknowledgedWarnings] = useState<string[]>([])
  const { ref: warningModalRef, open: openWarningModal, close: closeWarningModal } = useModalize()
  const [initDispatchedForId, setInitDispatchedForId] = useState<number | string | null>(null)

  const hasEstimation = useMemo(
    () =>
      signAccountOpState?.isInitialized &&
      !!signAccountOpState?.gasPrices &&
      !signAccountOpState.estimation.error,
    [
      signAccountOpState?.estimation?.error,
      signAccountOpState?.gasPrices,
      signAccountOpState?.isInitialized
    ]
  )

  useEffect(() => {
    // Ensures user can re-open the modal, if previously being closed, e.g.
    // there is an error (modal closed), but user opts-in sign again (open it).
    const isModalStillOpen = isChooseSignerShown && prevIsChooseSignerShown
    // These errors get displayed in the UI (in the <Warning /> component),
    // so in case of an error, closing the signer key selection modal is needed,
    // otherwise errors will be displayed behind the modal overlay.
    if (isModalStillOpen && !!signAccountOpState?.errors.length) {
      setIsChooseSignerShown(false)
    }
  }, [isChooseSignerShown, prevIsChooseSignerShown, signAccountOpState?.errors.length])

  const isSignLoading = getIsSignLoading(signAccountOpState?.status)

  useEffect(() => {
    if (signAccountOpState?.estimation.estimationRetryError) {
      setSlowRequest(false)
      return
    }
    const timeout = setTimeout(() => {
      // set the request to slow if the state is not init (no estimation)
      // or the gas prices haven't been fetched
      if (!signAccountOpState?.isInitialized || !signAccountOpState?.gasPrices) {
        setSlowRequest(true)
      }
    }, 5000)

    if (signAccountOpState?.isInitialized && !!signAccountOpState?.gasPrices) {
      clearTimeout(timeout)
      setSlowRequest(false)
    }

    return () => {
      clearTimeout(timeout)
    }
  }, [
    signAccountOpState?.isInitialized,
    signAccountOpState?.gasPrices,
    signAccountOpState?.estimation.estimationRetryError
  ])

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (slowPaymasterRequest) return

      if (signAccountOpState?.status?.type === SigningStatus.WaitingForPaymaster) {
        setSlowPaymasterRequest(true)
        openWarningModal()
      }
    }, 3000)

    if (signAccountOpState?.status?.type !== SigningStatus.WaitingForPaymaster) {
      clearTimeout(timeout)
      setSlowPaymasterRequest(false)
      if (slowPaymasterRequest) closeWarningModal()
    }

    return () => {
      clearTimeout(timeout)
    }
  }, [closeWarningModal, openWarningModal, signAccountOpState?.status?.type, slowPaymasterRequest])

  const network = useMemo(() => {
    return networks.find((n) => n.chainId === signAccountOpState?.accountOp?.chainId)
  }, [networks, signAccountOpState?.accountOp?.chainId])

  const signingKeyType = signAccountOpState?.accountOp?.signingKeyType
  const feePayerKeyType = mainState.feePayerKey?.type
  const isAtLeastOneOfTheKeysInvolvedLedger =
    signingKeyType === 'ledger' || feePayerKeyType === 'ledger'

  const handleDismissLedgerConnectModal = useCallback(() => {
    setShouldDisplayLedgerConnectModal(false)
  }, [])

  const warningToPromptBeforeSign = useMemo(
    () =>
      signAccountOpState?.warnings.find((warning) => {
        const signingType = isOneClickSign ? 'one-click-sign' : 'sign'
        const shouldPrompt = warning.promptBefore?.includes(signingType)

        if (!shouldPrompt) return false

        const isWarningAcknowledged = acknowledgedWarnings.includes(warning.id)

        return !isWarningAcknowledged
      }),
    [acknowledgedWarnings, isOneClickSign, signAccountOpState?.warnings]
  )

  const handleSign = useCallback(
    (_chosenSigningKeyType?: string, _warningAccepted?: boolean) => {
      // Prioritize warning(s) modals over all others
      // Warning modals are not displayed in the one-click swap flow
      if (warningToPromptBeforeSign && !_warningAccepted) {
        openWarningModal()
        handleUpdateStatus(SigningStatus.UpdatesPaused)
        return
      }

      const isLedgerKeyInvolvedInTheJustChosenKeys = _chosenSigningKeyType
        ? _chosenSigningKeyType === 'ledger' || feePayerKeyType === 'ledger'
        : isAtLeastOneOfTheKeysInvolvedLedger

      if (isLedgerKeyInvolvedInTheJustChosenKeys && !isLedgerConnected) {
        setShouldDisplayLedgerConnectModal(true)
        return
      }

      handleBroadcast()
    },
    [
      warningToPromptBeforeSign,
      feePayerKeyType,
      isAtLeastOneOfTheKeysInvolvedLedger,
      isLedgerConnected,
      handleBroadcast,
      openWarningModal,
      handleUpdateStatus
    ]
  )

  const handleChangeSigningKey = useCallback(
    (signingKeyAddr: Key['addr'], _chosenSigningKeyType: Key['type']) => {
      handleUpdate({ signingKeyAddr, signingKeyType: _chosenSigningKeyType })

      // Explicitly pass the currently selected signing key type, because
      // the signing key type in the state might not be updated yet,
      // and Sign Account Op controller assigns a default signing upfront
      handleSign(_chosenSigningKeyType)
      // setIsChooseSignerShown(false)
    },
    [handleSign, handleUpdate]
  )

  const onSignButtonClick = useCallback(() => {
    if (!signAccountOpState) return

    // If the account has only one signer, we don't need to show the select signer overlay,
    // and we will sign the transaction with the only one available signer (it is set by default in the controller).
    if (signAccountOpState?.accountKeyStoreKeys.length === 1) {
      handleSign()
      return
    }

    setIsChooseSignerShown(true)
  }, [signAccountOpState, handleSign])

  const acknowledgeWarning = useCallback(() => {
    if (!warningToPromptBeforeSign) return

    setAcknowledgedWarnings((prev) => [...prev, warningToPromptBeforeSign.id])
    closeWarningModal()
    handleSign(undefined, true)
  }, [warningToPromptBeforeSign, closeWarningModal, handleSign])

  useEffect(() => {
    if (shouldDisplayLedgerConnectModal && isLedgerConnected) {
      handleDismissLedgerConnectModal()
    }
  }, [handleDismissLedgerConnectModal, shouldDisplayLedgerConnectModal, isLedgerConnected])

  const dismissWarning = useCallback(() => {
    handleUpdateStatus(SigningStatus.ReadyToSign)

    closeWarningModal()
  }, [handleUpdateStatus, closeWarningModal])

  const isViewOnly = useMemo(
    () => signAccountOpState?.accountKeyStoreKeys.length === 0,
    [signAccountOpState?.accountKeyStoreKeys]
  )

  const isAtLeastOneOfTheKeysInvolvedExternal =
    (!!signingKeyType && signingKeyType !== 'internal') ||
    (!!feePayerKeyType && feePayerKeyType !== 'internal')

  const renderedButNotNecessarilyVisibleModal: 'warnings' | 'ledger-connect' | 'hw-sign' | null =
    useMemo(() => {
      // Prioritize warning(s) modals over all others
      if (
        warningToPromptBeforeSign ||
        // We render the warning modal if the paymaster is loading, but
        // don't display it to the user until the paymaster has been loading for too long.
        // This is required because opening the modal isn't possible if it isn't rendered.
        signAccountOpState?.status?.type === SigningStatus.WaitingForPaymaster
      )
        return 'warnings'

      if (shouldDisplayLedgerConnectModal) return 'ledger-connect'

      if (isAtLeastOneOfTheKeysInvolvedExternal) return 'hw-sign'

      return null
    }, [
      isAtLeastOneOfTheKeysInvolvedExternal,
      shouldDisplayLedgerConnectModal,
      signAccountOpState?.status?.type,
      warningToPromptBeforeSign
    ])

  const primaryButtonText = useMemo(() => {
    if (isAtLeastOneOfTheKeysInvolvedExternal) return t('Begin signing')

    return isSignLoading ? t('Signing...') : t('Sign')
  }, [isAtLeastOneOfTheKeysInvolvedExternal, isSignLoading, t])

  // When being done, there is a corner case if the sign succeeds, but the broadcast fails.
  // If so, the "Sign" button should NOT be disabled, so the user can retry broadcasting.
  const notReadyToSignButAlsoNotDone =
    !signAccountOpState?.readyToSign && signAccountOpState?.status?.type !== SigningStatus.Done

  const isSignDisabled = useMemo(() => {
    return (
      isViewOnly ||
      isSignLoading ||
      notReadyToSignButAlsoNotDone ||
      !signAccountOpState?.readyToSign ||
      (signAccountOpState && signAccountOpState.estimation.status === EstimationStatus.Loading)
    )
  }, [isViewOnly, isSignLoading, notReadyToSignButAlsoNotDone, signAccountOpState])

  const bundlerNonceDiscrepancy = useMemo(
    () =>
      signAccountOpState?.warnings.find((warning) => warning.id === 'bundler-nonce-discrepancy'),
    [signAccountOpState?.warnings]
  )

  return {
    renderedButNotNecessarilyVisibleModal,
    isViewOnly,
    dismissWarning,
    acknowledgeWarning,
    onSignButtonClick,
    handleChangeSigningKey,
    warningToPromptBeforeSign,
    handleDismissLedgerConnectModal,
    isChooseSignerShown,
    setIsChooseSignerShown,
    slowPaymasterRequest,
    slowRequest,
    isSignLoading,
    hasEstimation,
    warningModalRef,
    signingKeyType,
    feePayerKeyType,
    shouldDisplayLedgerConnectModal,
    network,
    notReadyToSignButAlsoNotDone,
    initDispatchedForId,
    setInitDispatchedForId,
    isSignDisabled,
    primaryButtonText,
    bundlerNonceDiscrepancy
  }
}

export default useSign
