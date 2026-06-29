import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { parseUnits } from 'viem'
import { AccountOpStatus } from '@ambire-common/libs/accountOp/types'

import { AddressStateOptional } from '@ambire-common/interfaces/domains'
import { ZERO_ADDRESS } from '@ambire-common/services/socket/constants'

import BackButton from '@common/components/BackButton'
import Banner from '@common/components/Banner'
// import Text from '@common/components/Text'
import { SelectValue } from '@common/components/Select/types'
import useAddressInput from '@common/hooks/useAddressInput'
import useNavigation from '@common/hooks/useNavigation'
import useToast from '@common/hooks/useToast'
import { ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
// import Button from '@common/components/Button'

import useActivityControllerState from '@web/hooks/useActivityControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useSyncedState from '@web/hooks/useSyncedState'
import useRailgunForm from '@web/modules/railgun/hooks/useRailgunForm'
import Buttons from '@web/modules/PPv1/deposit/components/Buttons'
// import TrackProgress from '@web/modules/sign-account-op/components/OneClick/TrackProgress'
import Completed from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/Completed'
import Failed from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/Failed'
// import InProgress from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/InProgress'
import useTrackAccountOp from '@web/modules/sign-account-op/hooks/OneClick/useTrackAccountOp'
import { getUiType } from '@web/utils/uiType'

import { View } from 'react-native'
import flexbox from '@common/styles/utils/flexbox'
import { Wrapper, Content, Form } from '@web/components/TransactionsScreen'
import PrivacyProtocolSelector, {
  getPrivacyProtocolOptions
} from '@web/components/PrivacyProtocols'
import { usePrivacyPoolsDepositForm } from '@web/hooks/useDepositForm'
import TransferForm from '../components/TransferForm/TransferForm'
import RailgunTransferForm from '../components/RailgunTransferForm/RailgunTransferForm'
import { TransferTabType } from '../components/Tabs/Tabs'

const { isActionWindow } = getUiType()

const TERMINAL_STATUSES = [
  AccountOpStatus.Success,
  AccountOpStatus.UnknownButPastNonce,
  AccountOpStatus.Failure,
  AccountOpStatus.Rejected,
  AccountOpStatus.BroadcastButStuck
]

const TransferScreen = () => {
  const { t } = useTranslation()
  const { navigate, searchParams, dashGoBack } = useNavigation()
  const addressFromParams = searchParams.get('address') ?? ''
  const protocolFromParams = searchParams.get('protocol') ?? ''
  const tokenFromParams = searchParams.get('token') ?? ''
  const showFundFreshAccountBanner = searchParams.get('fundBanner') === '1'
  const hasRefreshedAccountRef = useRef(false)
  const [isSubmittingState, setIsSubmittingState] = useState(false)
  const [selectedPrivacyProtocol, setSelectedPrivacyProtocol] = useState<SelectValue>(
    getPrivacyProtocolOptions(t)[protocolFromParams === 'privacy-pools' ? 1 : 0]
  )
  const activeProtocol = selectedPrivacyProtocol.value as TransferTabType
  const { dispatch } = useBackgroundService()
  const {
    totalApprovedBalance,
    loadingSelectionAlgorithm,
    withdrawalAmount,
    handleUpdateForm,
    refreshPrivateAccount,
    selectedToken,
    addressState,
    validationFormMsgs,
    latestBroadcastedAccountOp,
    isRecipientAddressUnknown,
    latestBroadcastedToken,
    amountFieldMode,
    amountInFiat,
    programmaticUpdateCounter,
    isRecipientAddressUnknownAgreed,
    maxAmount,
    relayerQuote,
    updateQuoteStatus,
    isRefreshing,
    unshield,
    isUnshielding
  } = usePrivacyPoolsDepositForm()

  const isSubmitting = useMemo(
    () => (activeProtocol === 'railgun' ? isSubmittingState : isUnshielding),
    [activeProtocol, isSubmittingState, isUnshielding]
  )

  const { accountsOps } = useActivityControllerState()
  const { addToast } = useToast()

  const railgunForm = useRailgunForm()
  const {
    chainId: railgunChainId,
    addressState: railgunAddressState,
    isRecipientAddressUnknown: railgunIsRecipientAddressUnknown,
    selectedToken: railgunSelectedToken,
    amountFieldMode: railgunAmountFieldMode,
    withdrawalAmount: railgunWithdrawalAmount,
    amountInFiat: railgunAmountInFiat,
    programmaticUpdateCounter: railgunProgrammaticUpdateCounter,
    isRecipientAddressUnknownAgreed: railgunIsRecipientAddressUnknownAgreed,
    maxAmount: railgunMaxAmount,
    latestBroadcastedAccountOp: railgunLatestBroadcastedAccountOp,
    latestBroadcastedToken: railgunLatestBroadcastedToken,
    totalApprovedBalance: railgunTotalApprovedBalance,
    totalPrivateBalancesFormatted: railgunTotalPrivateBalancesFormatted,
    handleUpdateForm: handleRailgunUpdateForm,
    setAddressState: setRailgunAddressState,
    privateOpInFlight: railgunPrivateOpInFlight
  } = railgunForm

  const changeProtocol = (protocol: SelectValue) => {
    const newProtocol = (protocol.value || 'railgun') as TransferTabType

    if (newProtocol === selectedPrivacyProtocol.value) return

    if (newProtocol === 'railgun') {
      dispatch({
        type: 'RAILGUN_V2_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP'
      })
    }

    setSelectedPrivacyProtocol(protocol)
  }

  const cleanUp = useCallback(() => {
    // Clean up state before navigating - use the appropriate controller based on active protocol
    dispatch({ type: 'RAILGUN_V2_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP' })
    dispatch({ type: 'PRIVACY_POOLS_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP' })

    // Reset hasProceeded for both controllers
    // to prevent double-click issue when withdrawing again
    dispatch({
      type: 'PRIVACY_POOLS_CONTROLLER_HAS_USER_PROCEEDED',
      params: { proceeded: false }
    })
    dispatch({
      type: 'RAILGUN_V2_CONTROLLER_HAS_USER_PROCEEDED',
      params: { proceeded: false }
    })

    railgunForm.resetForm()
    dispatch({
      type: 'PRIVACY_POOLS_CONTROLLER_RESET_FORM'
    })
  }, [dispatch, railgunForm])

  const hasInitializedAddressRef = useRef(false)
  if (!hasInitializedAddressRef.current && addressFromParams && !addressState.fieldValue) {
    hasInitializedAddressRef.current = true
    handleUpdateForm({ addressState: { fieldValue: addressFromParams } })
  }

  const hasInitializedRailgunAddressRef = useRef(false)
  if (
    !hasInitializedRailgunAddressRef.current &&
    addressFromParams &&
    !railgunAddressState.fieldValue
  ) {
    hasInitializedRailgunAddressRef.current = true
    handleRailgunUpdateForm({ addressState: { fieldValue: addressFromParams } })
  }

  const hasStaleTerminalOpRef = useRef(
    (() => {
      const prevOp =
        activeProtocol === 'railgun'
          ? railgunLatestBroadcastedAccountOp
          : latestBroadcastedAccountOp
      return !!(prevOp?.status && TERMINAL_STATUSES.includes(prevOp.status))
    })()
  )

  // Privacy Pools state
  const controllerAmountFieldValue = amountFieldMode === 'token' ? withdrawalAmount : amountInFiat
  const [amountFieldValue, setAmountFieldValue] = useSyncedState<string>({
    backgroundState: controllerAmountFieldValue,
    updateBackgroundState: (newAmount) => {
      handleUpdateForm({ withdrawalAmount: newAmount })
    },
    forceUpdateOnChangeList: [programmaticUpdateCounter, amountFieldMode]
  })
  const [addressStateFieldValue, setAddressStateFieldValue] = useSyncedState<string>({
    backgroundState: addressState.fieldValue || addressFromParams,
    updateBackgroundState: (newAddress: string) => {
      handleUpdateForm({ addressState: { fieldValue: newAddress } })
    },
    forceUpdateOnChangeList: [programmaticUpdateCounter]
  })

  // Railgun state syncing
  const railgunControllerAmountFieldValue =
    railgunAmountFieldMode === 'token' ? railgunWithdrawalAmount : railgunAmountInFiat
  const [railgunAmountFieldValue, setRailgunAmountFieldValue] = useSyncedState<string>({
    backgroundState: railgunControllerAmountFieldValue,
    updateBackgroundState: (newAmount) => {
      handleRailgunUpdateForm({ withdrawalAmount: newAmount })
    },
    forceUpdateOnChangeList: [railgunProgrammaticUpdateCounter, railgunAmountFieldMode]
  })
  const [railgunAddressStateFieldValue, setRailgunAddressStateFieldValue] = useSyncedState<string>({
    backgroundState: railgunAddressState.fieldValue || addressFromParams,
    updateBackgroundState: (newAddress: string) => {
      handleRailgunUpdateForm({ addressState: { fieldValue: newAddress } })
    },
    forceUpdateOnChangeList: [railgunProgrammaticUpdateCounter]
  })

  const submittedAccountOp = useMemo(() => {
    // For Railgun withdrawals, check accountsOps.transfer
    if (activeProtocol === 'railgun') {
      if (!railgunLatestBroadcastedAccountOp) return

      // First, try to find it in accountsOps (this will have the most up-to-date status)
      // Match by signature (txHash) or txnId
      if (accountsOps.transfer) {
        const signature = railgunLatestBroadcastedAccountOp.signature
        const txnId =
          railgunLatestBroadcastedAccountOp.txnId ||
          (railgunLatestBroadcastedAccountOp as any).meta?.txnId

        const found = accountsOps.transfer.result.items.find(
          (accOp) =>
            (signature && accOp.signature === signature) ||
            (txnId && accOp.txnId === txnId) ||
            (signature && accOp.txnId === signature) // signature is the txHash
        )
        if (found) return found
      }

      // Fall back to latestBroadcastedAccountOp if not found in accountsOps yet
      // This handles the case when withdrawal is first submitted
      return railgunLatestBroadcastedAccountOp as any
    }

    // For Privacy Pools withdrawals
    if (latestBroadcastedAccountOp?.meta?.isPrivacyPoolsWithdrawal) {
      return latestBroadcastedAccountOp as any
    }

    if (!accountsOps.privacyPools || !latestBroadcastedAccountOp?.signature) return

    return accountsOps.privacyPools.result.items.find(
      (accOp) => accOp.signature === latestBroadcastedAccountOp.signature
    )
  }, [
    accountsOps.privacyPools,
    accountsOps.transfer,
    latestBroadcastedAccountOp,
    railgunLatestBroadcastedAccountOp,
    activeProtocol
  ])

  const navigateOut = useCallback(() => {
    if (isActionWindow) {
      dispatch({
        type: 'CLOSE_SIGNING_ACTION_WINDOW',
        params: {
          type: 'transfer'
        }
      })
    } else {
      navigate(ROUTES.mainDashboard)
    }
  }, [dispatch, navigate, activeProtocol])

  const currentLatestBroadcastedAccountOp = useMemo(() => {
    return activeProtocol === 'railgun'
      ? railgunLatestBroadcastedAccountOp
      : latestBroadcastedAccountOp
  }, [activeProtocol, railgunLatestBroadcastedAccountOp, latestBroadcastedAccountOp])

  // Use 'transfer' sessionId for Railgun, 'privacyPools' for Privacy Pools
  const sessionId = useMemo(() => {
    return activeProtocol === 'railgun' ? 'transfer' : 'privacyPools'
  }, [activeProtocol])

  const { sessionHandler, onPrimaryButtonPress } = useTrackAccountOp({
    address: currentLatestBroadcastedAccountOp?.accountAddr,
    chainId: currentLatestBroadcastedAccountOp?.chainId,
    sessionId,
    submittedAccountOp,
    navigateOut
  })

  // Helper to check if the submittedAccountOp matches the expected withdrawal type
  const isMatchingWithdrawal = useMemo(() => {
    if (!submittedAccountOp) return false

    const metaAny = submittedAccountOp.meta as any
    if (activeProtocol === 'railgun') {
      // For Railgun, must have isRailgunWithdrawal meta tag
      return !!metaAny?.isRailgunWithdrawal
    }
    // For Privacy Pools, must have isPrivacyPoolsWithdrawal meta tag
    return !!metaAny?.isPrivacyPoolsWithdrawal
  }, [submittedAccountOp, activeProtocol])

  const explorerLink = useMemo(() => {
    if (!submittedAccountOp || !isMatchingWithdrawal) return

    // Railgun's broadcast returns no tx hash, so the op's txnId is a placeholder —
    // never build a (dead) explorer link from it.
    if ((submittedAccountOp.meta as any)?.isRailgunOperation) return

    const { chainId: submittedChainId, identifiedBy, txnId } = submittedAccountOp

    if (!submittedChainId || !identifiedBy || !txnId) return

    return `https://sepolia.etherscan.io/tx/${txnId}`
  }, [submittedAccountOp, isMatchingWithdrawal])

  useEffect(() => {
    if (
      !currentLatestBroadcastedAccountOp?.accountAddr ||
      !currentLatestBroadcastedAccountOp?.chainId
    )
      return
    sessionHandler.initSession()

    return () => {
      sessionHandler.killSession()
    }
  }, [
    currentLatestBroadcastedAccountOp?.accountAddr,
    currentLatestBroadcastedAccountOp?.chainId,
    sessionHandler
  ])

  const displayedView: 'transfer' | 'track' = useMemo(() => {
    if (hasStaleTerminalOpRef.current) return 'transfer'
    if (currentLatestBroadcastedAccountOp) return 'track'

    return 'transfer'
  }, [currentLatestBroadcastedAccountOp])

  useEffect(() => {
    if (!currentLatestBroadcastedAccountOp) {
      hasStaleTerminalOpRef.current = false
    }
  }, [currentLatestBroadcastedAccountOp])

  useEffect(() => {
    // On mount: if a previous op is in a terminal state, clear it so we
    // never land on the track screen when returning after a tab close.
    const prevOp =
      activeProtocol === 'railgun' ? railgunLatestBroadcastedAccountOp : latestBroadcastedAccountOp

    if (prevOp?.status && TERMINAL_STATUSES.includes(prevOp.status)) {
      cleanUp()
    }

    return () => {
      cleanUp()
      dispatch({
        type: 'PRIVACY_POOLS_CONTROLLER_UNLOAD_SCREEN'
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // Privacy Pools address input
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

  // Railgun address state handlers
  const handleRailgunCacheResolvedDomain = useCallback(
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

  // Create a merged addressState that uses the synced field value
  // This ensures useAddressInput sees the current input value
  const mergedRailgunAddressState = useMemo(
    () => ({
      ...railgunAddressState,
      fieldValue: railgunAddressStateFieldValue || railgunAddressState.fieldValue
    }),
    [railgunAddressState, railgunAddressStateFieldValue]
  )

  const railgunAddressInputState = useAddressInput({
    addressState: mergedRailgunAddressState,
    setAddressState: setRailgunAddressState,
    // Don't use overwriteError/overwriteValidLabel from controller for now
    // Let useAddressInput handle validation internally
    overwriteError: '',
    overwriteValidLabel: '',
    handleCacheResolvedDomain: handleRailgunCacheResolvedDomain,
    // Allow Railgun 0zk addresses on the Railgun protocol
    allowRailgunAddresses: true
  })

  const amountErrorMessage = useMemo(() => {
    if (!withdrawalAmount || withdrawalAmount.trim() === '' || !selectedToken) return ''

    try {
      const amount = parseUnits(withdrawalAmount, selectedToken.decimals)

      // if (amount < poolInfo.minWithdrawal) {
      //   return `Minimum transfer amount is ${formatUnits(poolInfo.minWithdrawal, 18)} ETH`
      // }

      if (amount > parseUnits(maxAmount, selectedToken.decimals)) {
        return 'Insufficient amount'
      }

      // safety check if relayer feeBPS change in future
      if (relayerQuote?.relayFeeBPS) {
        const fee = (amount * BigInt(relayerQuote.relayFeeBPS)) / 10000n

        if (amount <= fee) {
          return 'Amount too small to cover relay fees'
        }
      }

      return ''
    } catch (error) {
      return 'Invalid amount'
    }
  }, [withdrawalAmount, relayerQuote, maxAmount, selectedToken])

  // Privacy Pools form validation
  const isTransferFormValid = useMemo(() => {
    return !!(
      amountFieldValue &&
      amountFieldValue !== '0' &&
      selectedToken &&
      relayerQuote &&
      !addressInputState.validation.isError &&
      !amountErrorMessage &&
      !isRefreshing &&
      !loadingSelectionAlgorithm
    )
  }, [
    amountFieldValue,
    amountErrorMessage,
    selectedToken,
    addressInputState.validation.isError,
    relayerQuote,
    isRefreshing,
    loadingSelectionAlgorithm
  ])

  // Get totalPrivateBalancesFormatted from useRailgunForm
  // Railgun amount error message
  const railgunAmountErrorMessage = useMemo(() => {
    if (!railgunWithdrawalAmount || railgunWithdrawalAmount.trim() === '') return ''
    if (!railgunSelectedToken) return ''
    if (!railgunSelectedToken.address) return 'Token address not available'

    try {
      // Get the balance for the selected token
      const tokenAddressLower = railgunSelectedToken.address.toLowerCase()
      const balanceInfo = railgunTotalPrivateBalancesFormatted[tokenAddressLower]

      if (!balanceInfo) {
        return 'No balance available for this token'
      }

      const decimals = balanceInfo.decimals || railgunSelectedToken.decimals || 18
      const amount = parseUnits(railgunWithdrawalAmount, decimals)
      const availableBalance = BigInt(balanceInfo.amount)

      if (amount > availableBalance) {
        return 'Insufficient funds for amount'
      }

      return ''
    } catch (error) {
      return 'Invalid amount'
    }
  }, [railgunWithdrawalAmount, railgunSelectedToken, railgunTotalPrivateBalancesFormatted])

  // Railgun form validation
  const isRailgunTransferFormValid = useMemo(() => {
    // Use the synced state value for address check, or fall back to controller state
    const addressValue = railgunAddressStateFieldValue || railgunAddressState.fieldValue
    const hasAmount =
      railgunAmountFieldValue &&
      railgunAmountFieldValue !== '0' &&
      parseFloat(railgunAmountFieldValue) > 0
    const hasToken = !!railgunSelectedToken
    const hasAddress = addressValue && addressValue.trim() !== ''

    // For address validation, check if the address input state says it's valid
    // OR if we have an address value and no explicit error
    const addressIsValid =
      !railgunAddressInputState.validation.isError ||
      (hasAddress && !railgunAddressInputState.validation.message)
    const noAmountError = !railgunAmountErrorMessage

    return !!(hasAmount && hasToken && hasAddress && addressIsValid && noAmountError)
  }, [
    railgunAmountFieldValue,
    railgunAmountErrorMessage,
    railgunSelectedToken,
    railgunAddressInputState.validation.isError,
    railgunAddressInputState.validation.message,
    railgunAddressStateFieldValue,
    railgunAddressState.fieldValue
  ])

  // Dynamic title: "Private Send" when recipient is a 0zk Railgun address, "Withdrawal" otherwise
  const headerTitle = useMemo(() => {
    const currentAddress =
      activeProtocol === 'railgun'
        ? railgunAddressStateFieldValue || railgunAddressState.fieldValue
        : addressStateFieldValue || addressState.fieldValue
    if (currentAddress && currentAddress.toLowerCase().startsWith('0zk')) {
      return t('Private Send')
    }
    return t('Withdrawal')
  }, [
    activeProtocol,
    railgunAddressStateFieldValue,
    railgunAddressState.fieldValue,
    addressStateFieldValue,
    addressState.fieldValue,
    t
  ])

  // Determine which latestBroadcastedToken to use based on active protocol
  const currentLatestBroadcastedToken = useMemo(() => {
    return activeProtocol === 'railgun' ? railgunLatestBroadcastedToken : latestBroadcastedToken
  }, [activeProtocol, railgunLatestBroadcastedToken, latestBroadcastedToken])

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

      cleanUp()

      // Navigate immediately instead of waiting for the flag
      navigateOut()
    } else if (
      submittedAccountOp?.status === AccountOpStatus.Failure ||
      submittedAccountOp?.status === AccountOpStatus.BroadcastButStuck ||
      submittedAccountOp?.status === AccountOpStatus.Rejected
    ) {
      // Error states: clean up and navigate directly (no banner to hide)
      dispatch({
        type: 'RAILGUN_V2_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP'
      })
      dispatch({
        type: 'PRIVACY_POOLS_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP'
      })
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
      navigateOut()
    } else {
      // For other states, use the original logic
      onPrimaryButtonPress()
    }
  }, [submittedAccountOp, dispatch, navigateOut, onPrimaryButtonPress])

  const handleWithdrawal = useCallback(() => {
    unshield()
  }, [unshield])

  const handleRailgunWithdrawal = useCallback(async () => {
    setIsSubmittingState(true)
    try {
      await railgunForm.handleMultipleWithdrawal()
    } catch {
      setIsSubmittingState(false)
    }
  }, [railgunForm])

  // Hand the local submitting flag off to the controller once it picks up the op
  // (railgunPrivateOpInFlight then drives "Sending…" and clears on EVERY exit path,
  // incl. a prepare failure — so the button can't get stuck). Also clear on a
  // broadcasted op or a form error as fallbacks if the controller never picks up.
  useEffect(() => {
    if (
      isSubmittingState &&
      (railgunPrivateOpInFlight || currentLatestBroadcastedAccountOp || railgunForm.message)
    ) {
      setIsSubmittingState(false)
    }
  }, [
    isSubmittingState,
    railgunPrivateOpInFlight,
    currentLatestBroadcastedAccountOp,
    railgunForm.message
  ])

  const isPendingBroadcast = !!currentLatestBroadcastedAccountOp && !submittedAccountOp?.status

  const isResultPending =
    isPendingBroadcast ||
    submittedAccountOp?.status === AccountOpStatus.BroadcastedButNotConfirmed ||
    ((submittedAccountOp?.status === AccountOpStatus.Success ||
      submittedAccountOp?.status === AccountOpStatus.UnknownButPastNonce) &&
      !isMatchingWithdrawal)

  const hasResult =
    ((submittedAccountOp?.status === AccountOpStatus.Success ||
      submittedAccountOp?.status === AccountOpStatus.UnknownButPastNonce) &&
      isMatchingWithdrawal) ||
    submittedAccountOp?.status === AccountOpStatus.Failure ||
    submittedAccountOp?.status === AccountOpStatus.Rejected ||
    submittedAccountOp?.status === AccountOpStatus.BroadcastButStuck

  const buttons = useMemo(() => {
    if (activeProtocol === 'railgun') {
      return (
        <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
          <BackButton
            onPress={hasResult ? navigateOut : dashGoBack}
            withIcon={false}
            text={hasResult ? t('Close') : undefined}
          />
          <Buttons
            handleSubmitForm={hasResult ? handlePrimaryButtonPress : handleRailgunWithdrawal}
            proceedBtnText={
              isResultPending || isSubmitting || railgunPrivateOpInFlight
                ? t('Sending...')
                : hasResult
                ? t('Send new transaction')
                : t('Send')
            }
            isNotReadyToProceed={
              isResultPending || isSubmitting || railgunPrivateOpInFlight
                ? true
                : hasResult
                ? false
                : !isRailgunTransferFormValid
            }
            signAccountOpErrors={[]}
            networkUserRequests={[]}
            isLoading={isResultPending || isSubmitting || railgunPrivateOpInFlight}
          />
        </View>
      )
    }

    return (
      <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
        <BackButton
          onPress={hasResult ? navigateOut : dashGoBack}
          text={hasResult ? t('Close') : undefined}
        />
        <Buttons
          handleSubmitForm={hasResult ? handlePrimaryButtonPress : handleWithdrawal}
          proceedBtnText={
            isResultPending
              ? t('Sending...')
              : hasResult
              ? t('Send new transaction')
              : isRefreshing
              ? t('Updating...')
              : t('Send')
          }
          isNotReadyToProceed={
            isResultPending ? true : hasResult ? false : !isTransferFormValid || isRefreshing
          }
          signAccountOpErrors={[]}
          networkUserRequests={[]}
          isLoading={isResultPending || (!hasResult && (isSubmitting || isRefreshing))}
        />
      </View>
    )
  }, [
    dashGoBack,
    navigateOut,
    handlePrimaryButtonPress,
    isTransferFormValid,
    isRailgunTransferFormValid,
    t,
    isSubmitting,
    railgunPrivateOpInFlight,
    isRefreshing,
    isResultPending,
    hasResult,
    handleWithdrawal,
    handleRailgunWithdrawal,
    activeProtocol
  ])

  // Refresh merkle tree and private account after successful withdrawal
  useEffect(() => {
    if (
      !hasRefreshedAccountRef.current &&
      (submittedAccountOp?.status === AccountOpStatus.Success ||
        submittedAccountOp?.status === AccountOpStatus.UnknownButPastNonce)
    ) {
      hasRefreshedAccountRef.current = true

      if (activeProtocol === 'railgun') {
        // For Railgun, use railgunForm's refreshPrivateAccount
        railgunForm
          .refreshPrivateAccount()
          .then(() => {
            setIsSubmittingState(false)
          })
          .catch((error) => {
            // eslint-disable-next-line no-console
            console.error('Failed to refresh after Railgun withdrawal:', error)
            addToast('Failed to refresh your privacy account. Please try again.', { type: 'error' })
            setIsSubmittingState(false)
          })
      } else {
        // For Privacy Pools
        refreshPrivateAccount()
          .then(() => {
            setIsSubmittingState(false)
          })
          .catch((error) => {
            // eslint-disable-next-line no-console
            console.error('Failed to refresh after withdrawal:', error)
            addToast('Failed to refresh your privacy account. Please try again.', { type: 'error' })
            setIsSubmittingState(false)
          })
      }
    }
  }, [submittedAccountOp?.status, refreshPrivateAccount, railgunForm, addToast, activeProtocol])

  return (
    <Wrapper
      title={headerTitle}
      description={t('Move tokens from your private pool to a public address')}
      // buttons={buttons}
      buttons={null}
    >
      <Content buttons={buttons}>
        {showFundFreshAccountBanner && (
          <Banner
            type="success"
            title={t('Fund your freshly generated account with private ETH')}
            style={{ marginBottom: 12 }}
          />
        )}
        <Form>
          {!hasResult && (
            <>
              <PrivacyProtocolSelector
                selectedProtocol={selectedPrivacyProtocol}
                changeProtocol={changeProtocol}
                containerStyle={[spacings.mb]}
                disabled={isResultPending}
              />

              {activeProtocol === 'privacy-pools' ? (
                <TransferForm
                  addressInputState={addressInputState}
                  amountErrorMessage={amountErrorMessage}
                  isRecipientAddressUnknown={isRecipientAddressUnknown}
                  formTitle={t('Amount')}
                  amountFieldValue={amountFieldValue}
                  setAmountFieldValue={setAmountFieldValue}
                  addressStateFieldValue={addressStateFieldValue}
                  setAddressStateFieldValue={setAddressStateFieldValue}
                  handleUpdateForm={handleUpdateForm}
                  selectedToken={selectedToken}
                  maxAmount={maxAmount || '0'}
                  quoteFee={relayerQuote?.estimatedFee || '0'}
                  amountFieldMode={amountFieldMode}
                  amountInFiat={amountInFiat}
                  isRecipientAddressUnknownAgreed={isRecipientAddressUnknownAgreed || false}
                  addressState={addressState}
                  controllerAmount={withdrawalAmount}
                  totalApprovedBalance={totalApprovedBalance}
                  updateQuoteStatus={updateQuoteStatus}
                  disabled={isResultPending}
                />
              ) : (
                <RailgunTransferForm
                  addressInputState={railgunAddressInputState}
                  amountErrorMessage={railgunAmountErrorMessage}
                  isRecipientAddressUnknown={railgunIsRecipientAddressUnknown}
                  formTitle={t('Amount')}
                  amountFieldValue={railgunAmountFieldValue}
                  setAmountFieldValue={setRailgunAmountFieldValue}
                  addressStateFieldValue={railgunAddressStateFieldValue}
                  setAddressStateFieldValue={setRailgunAddressStateFieldValue}
                  handleUpdateForm={handleRailgunUpdateForm}
                  selectedToken={railgunSelectedToken}
                  maxAmount={railgunMaxAmount || '0'}
                  amountFieldMode={railgunAmountFieldMode}
                  amountInFiat={railgunAmountInFiat}
                  isRecipientAddressUnknownAgreed={railgunIsRecipientAddressUnknownAgreed || false}
                  addressState={railgunAddressState}
                  controllerAmount={railgunWithdrawalAmount}
                  totalApprovedBalance={railgunTotalApprovedBalance}
                  totalPrivateBalancesFormatted={railgunTotalPrivateBalancesFormatted}
                  chainId={railgunChainId || 11155111}
                  defaultTokenToEth={tokenFromParams === 'eth'}
                  disabled={isResultPending}
                />
              )}
            </>
          )}

          {/* Completed result — shown when the op has settled and matches this withdrawal */}
          {(submittedAccountOp?.status === AccountOpStatus.Success ||
            submittedAccountOp?.status === AccountOpStatus.UnknownButPastNonce) &&
            isMatchingWithdrawal && (
              <Completed
                title={
                  activeProtocol === 'railgun' &&
                  ((submittedAccountOp?.meta as any)?.isRailgunInternalTransfer ||
                    (currentLatestBroadcastedAccountOp as any)?.meta?.isRailgunInternalTransfer)
                    ? t('Private Internal Transfer done!')
                    : t('Private Transfer done!')
                }
                titleSecondary={t('{{symbol}} sent!', {
                  symbol: currentLatestBroadcastedToken?.symbol || 'Token'
                })}
                explorerLink={explorerLink}
                openExplorerText="View Transfer"
              />
            )}

          {/* Failed result */}
          {(submittedAccountOp?.status === AccountOpStatus.Failure ||
            submittedAccountOp?.status === AccountOpStatus.Rejected ||
            submittedAccountOp?.status === AccountOpStatus.BroadcastButStuck) && (
            <Failed
              title={t('Something went wrong!')}
              errorMessage={t(
                "We couldn't complete your transfer. Please try again later or contact Kohaku support."
              )}
            />
          )}
        </Form>
      </Content>
    </Wrapper>
  )
}

export default React.memo(TransferScreen)
