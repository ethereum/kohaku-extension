import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatUnits, parseUnits, getAddress } from 'viem'
import { RAILGUN_CONFIG_BY_CHAIN_ID } from '@kohaku-eth/railgun'
import { Call } from '@ambire-common/libs/accountOp/types'
import { randomId } from '@ambire-common/libs/humanizer/utils'

import { AddressStateOptional } from '@ambire-common/interfaces/domains'
import { AccountOpStatus } from '@ambire-common/libs/accountOp/types'
import { getBenzinUrlParams } from '@ambire-common/utils/benzin'
import { ZERO_ADDRESS } from '@ambire-common/services/socket/constants'
import { SigningStatus } from '@ambire-common/controllers/signAccountOp/signAccountOp'
import { Key } from '@ambire-common/interfaces/keystore'

import BackButton from '@common/components/BackButton'
import Text from '@common/components/Text'
import useAddressInput from '@common/hooks/useAddressInput'
import useNavigation from '@common/hooks/useNavigation'
import useToast from '@common/hooks/useToast'
import { ROUTES } from '@common/modules/router/constants/common'

import useActivityControllerState from '@web/hooks/useActivityControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useSyncedState from '@web/hooks/useSyncedState'
import usePrivacyPoolsControllerState from '@web/hooks/usePrivacyPoolsControllerState'
import useRailgunControllerState from '@web/hooks/useRailgunControllerState'
import useRailgunForm from '@web/modules/railgun/hooks/useRailgunForm'
import Buttons from '@web/modules/PPv1/deposit/components/Buttons'
import TrackProgress from '@web/modules/sign-account-op/components/OneClick/TrackProgress'
import Completed from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/Completed'
import Failed from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/Failed'
import InProgress from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/InProgress'
import useTrackAccountOp from '@web/modules/sign-account-op/hooks/OneClick/useTrackAccountOp'
import Estimation from '@web/modules/sign-account-op/components/OneClick/Estimation'
import { getUiType } from '@web/utils/uiType'

import { View } from 'react-native'
import flexbox from '@common/styles/utils/flexbox'
import TransferForm from '../components/TransferForm/TransferForm'
import RailgunTransferForm from '../components/RailgunTransferForm/RailgunTransferForm'
import Tabs, { TransferTabType } from '../components/Tabs/Tabs'
import usePrivacyPoolsForm from '../../hooks/usePrivacyPoolsForm'
import { Wrapper, Content, Form } from '../components/TransfersScreen'

const { isActionWindow } = getUiType()

const TransferScreen = () => {
  const hasRefreshedAccountRef = useRef(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState<TransferTabType>('privacy-pools')
  const { dispatch } = useBackgroundService()
  const {
    chainId,
    poolInfo,
    totalApprovedBalance,
    loadingSelectionAlgorithm,
    handleUpdateForm,
    refreshPrivateAccount,
    handleMultipleWithdrawal
  } = usePrivacyPoolsForm()
  const {
    validationFormMsgs,
    addressState,
    isRecipientAddressUnknown,
    latestBroadcastedAccountOp,
    latestBroadcastedToken,
    selectedToken,
    amountFieldMode,
    withdrawalAmount,
    amountInFiat,
    programmaticUpdateCounter,
    isRecipientAddressUnknownAgreed,
    maxAmount,
    relayerQuote,
    updateQuoteStatus,
    isRefreshing
  } = usePrivacyPoolsControllerState()

  const { navigate } = useNavigation()
  const { t } = useTranslation()
  const { accountsOps } = useActivityControllerState()
  const { addToast } = useToast()

  // Railgun state
  const {
    chainId: railgunChainId,
    validationFormMsgs: railgunValidationFormMsgs,
    addressState: railgunAddressState,
    isRecipientAddressUnknown: railgunIsRecipientAddressUnknown,
    selectedToken: railgunSelectedToken,
    amountFieldMode: railgunAmountFieldMode,
    withdrawalAmount: railgunWithdrawalAmount,
    amountInFiat: railgunAmountInFiat,
    programmaticUpdateCounter: railgunProgrammaticUpdateCounter,
    isRecipientAddressUnknownAgreed: railgunIsRecipientAddressUnknownAgreed,
    maxAmount: railgunMaxAmount,
    withdrawAsWETH: railgunWithdrawAsWETH,
    railgunAccountsState,
    latestBroadcastedAccountOp: railgunLatestBroadcastedAccountOp,
    latestBroadcastedToken: railgunLatestBroadcastedToken
  } = useRailgunControllerState()

  const railgunTotalApprovedBalance = useMemo(() => {
    if (railgunAccountsState.balances.length > 0) {
      let balance = BigInt(0)
      for (const bal of railgunAccountsState.balances) {
        if (bal.tokenAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
          balance += BigInt(bal.amount)
        }
      }
      return { total: balance, accounts: [] as [] }
    }
    return { total: 0n, accounts: [] as [] }
  }, [railgunAccountsState])

  const handleRailgunUpdateForm = useCallback(
    (params: { [key: string]: any }) => {
      dispatch({
        type: 'RAILGUN_CONTROLLER_UPDATE_FORM',
        params: { ...params }
      })
    },
    [dispatch]
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
    backgroundState: addressState.fieldValue,
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
    backgroundState: railgunAddressState.fieldValue,
    updateBackgroundState: (newAddress: string) => {
      handleRailgunUpdateForm({ addressState: { fieldValue: newAddress } })
    },
    forceUpdateOnChangeList: [railgunProgrammaticUpdateCounter]
  })

  const submittedAccountOp = useMemo(() => {
    // For Railgun withdrawals, check accountsOps.transfer
    if (activeTab === 'railgun') {
      if (!railgunLatestBroadcastedAccountOp?.signature) return

      if (!accountsOps.transfer) return

      return accountsOps.transfer.result.items.find(
        (accOp) => accOp.signature === railgunLatestBroadcastedAccountOp.signature
      )
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
    activeTab
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
      navigate(ROUTES.pp1Home)
    }

    if (activeTab === 'railgun') {
      dispatch({
        type: 'RAILGUN_CONTROLLER_RESET_FORM'
      })
    } else {
      dispatch({
        type: 'PRIVACY_POOLS_CONTROLLER_RESET_FORM'
      })
    }
  }, [dispatch, navigate, activeTab])

  // Determine which latestBroadcastedAccountOp to use based on active tab
  const currentLatestBroadcastedAccountOp = useMemo(() => {
    return activeTab === 'railgun' ? railgunLatestBroadcastedAccountOp : latestBroadcastedAccountOp
  }, [activeTab, railgunLatestBroadcastedAccountOp, latestBroadcastedAccountOp])

  // Use 'transfer' sessionId for Railgun, 'privacyPools' for Privacy Pools
  const sessionId = useMemo(() => {
    return activeTab === 'railgun' ? 'transfer' : 'privacyPools'
  }, [activeTab])

  const { sessionHandler, onPrimaryButtonPress } = useTrackAccountOp({
    address: currentLatestBroadcastedAccountOp?.accountAddr,
    chainId: currentLatestBroadcastedAccountOp?.chainId,
    sessionId,
    submittedAccountOp,
    navigateOut
  })

  const explorerLink = useMemo(() => {
    if (!submittedAccountOp) return

    const { chainId: submittedChainId, identifiedBy, txnId } = submittedAccountOp

    if (!submittedChainId || !identifiedBy || !txnId) return

    return `https://explorer.ambire.com/${getBenzinUrlParams({
      chainId: submittedChainId,
      txnId,
      identifiedBy
    })}`
  }, [submittedAccountOp])

  useEffect(() => {
    if (!currentLatestBroadcastedAccountOp?.accountAddr || !currentLatestBroadcastedAccountOp?.chainId) return
    sessionHandler.initSession()

    return () => {
      sessionHandler.killSession()
    }
  }, [currentLatestBroadcastedAccountOp?.accountAddr, currentLatestBroadcastedAccountOp?.chainId, sessionHandler])

  const displayedView: 'transfer' | 'track' = useMemo(() => {
    if (currentLatestBroadcastedAccountOp) return 'track'

    return 'transfer'
  }, [currentLatestBroadcastedAccountOp])

  useEffect(() => {
    return () => {
      dispatch({
        type: 'PRIVACY_POOLS_CONTROLLER_UNLOAD_SCREEN'
      })
      dispatch({
        type: 'RAILGUN_CONTROLLER_UNLOAD_SCREEN'
      })
    }
  }, [dispatch])

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
  const setRailgunAddressState = useCallback(
    (newPartialAddressState: AddressStateOptional) => {
      dispatch({
        type: 'RAILGUN_CONTROLLER_UPDATE_FORM',
        params: { addressState: newPartialAddressState }
      })
    },
    [dispatch]
  )

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
  const mergedRailgunAddressState = useMemo(() => ({
    ...railgunAddressState,
    fieldValue: railgunAddressStateFieldValue || railgunAddressState.fieldValue
  }), [railgunAddressState, railgunAddressStateFieldValue])

  const railgunAddressInputState = useAddressInput({
    addressState: mergedRailgunAddressState,
    setAddressState: setRailgunAddressState,
    // Don't use overwriteError/overwriteValidLabel from controller for now
    // Let useAddressInput handle validation internally
    overwriteError: '',
    overwriteValidLabel: '',
    handleCacheResolvedDomain: handleRailgunCacheResolvedDomain
  })

  // Debug: Log validation messages
  if (process.env.NODE_ENV === 'development') {
    console.log('Railgun Address Validation State:', {
      addressFieldValue: railgunAddressStateFieldValue,
      controllerAddressFieldValue: railgunAddressState.fieldValue,
      mergedAddressFieldValue: mergedRailgunAddressState.fieldValue,
      validationMsgs: railgunValidationFormMsgs.recipientAddress,
      addressInputValidation: railgunAddressInputState.validation,
      addressState: railgunAddressState
    })
  }

  const amountErrorMessage = useMemo(() => {
    if (!withdrawalAmount || withdrawalAmount.trim() === '') return ''
    if (!poolInfo) return ''

    try {
      const amount = parseUnits(withdrawalAmount, 18)

      if (amount < poolInfo.minWithdrawal) {
        return `Minimum transfer amount is ${formatUnits(poolInfo.minWithdrawal, 18)} ETH`
      }

      if (amount > totalApprovedBalance.total) {
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
  }, [withdrawalAmount, totalApprovedBalance.total, poolInfo, relayerQuote])

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
  const railgunForm = useRailgunForm()
  const railgunTotalPrivateBalancesFormatted = railgunForm.totalPrivateBalancesFormatted

  // Railgun amount error message
  const railgunAmountErrorMessage = useMemo(() => {
    if (!railgunWithdrawalAmount || railgunWithdrawalAmount.trim() === '') return ''
    if (!railgunSelectedToken) return ''

    try {
      // Get the balance for the selected token
      const tokenAddressLower = railgunSelectedToken.address?.toLowerCase()
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
    const hasAmount = railgunAmountFieldValue && railgunAmountFieldValue !== '0' && parseFloat(railgunAmountFieldValue) > 0
    const hasToken = !!railgunSelectedToken
    const hasAddress = addressValue && addressValue.trim() !== ''
    
    // For address validation, check if the address input state says it's valid
    // OR if we have an address value and no explicit error
    const addressIsValid = !railgunAddressInputState.validation.isError || 
      (hasAddress && !railgunAddressInputState.validation.message)
    const noAmountError = !railgunAmountErrorMessage

    // Debug logging (can be removed later)
    if (process.env.NODE_ENV === 'development') {
      console.log('Railgun Form Validation:', {
        hasAmount,
        hasToken,
        hasAddress,
        addressIsValid,
        noAmountError,
        amountFieldValue: railgunAmountFieldValue,
        addressFieldValue: addressValue,
        syncedAddressFieldValue: railgunAddressStateFieldValue,
        controllerAddressFieldValue: railgunAddressState.fieldValue,
        selectedToken: railgunSelectedToken?.symbol,
        addressError: railgunAddressInputState.validation.isError,
        addressValidationMessage: railgunAddressInputState.validation.message,
        amountError: railgunAmountErrorMessage
      })
    }

    return !!(
      hasAmount &&
      hasToken &&
      hasAddress &&
      addressIsValid &&
      noAmountError
    )
  }, [
    railgunAmountFieldValue,
    railgunAmountErrorMessage,
    railgunSelectedToken,
    railgunAddressInputState.validation.isError,
    railgunAddressInputState.validation.message,
    railgunAddressStateFieldValue,
    railgunAddressState.fieldValue
  ])

  const onBack = useCallback(() => {
    if (activeTab === 'privacy-pools') {
      dispatch({
        type: 'PRIVACY_POOLS_CONTROLLER_RESET_FORM'
      })
    } else {
      dispatch({
        type: 'RAILGUN_CONTROLLER_RESET_FORM'
      })
    }
    navigate(ROUTES.pp1Home)
  }, [navigate, dispatch, activeTab])

  const headerTitle = t('Private Transfer')
  const formTitle = t('Send')

  // Determine which latestBroadcastedToken to use based on active tab
  const currentLatestBroadcastedToken = useMemo(() => {
    return activeTab === 'railgun' ? railgunLatestBroadcastedToken : latestBroadcastedToken
  }, [activeTab, railgunLatestBroadcastedToken, latestBroadcastedToken])

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
      
      // Clean up state before navigating - use the appropriate controller based on active tab
      if (activeTab === 'railgun') {
        dispatch({
          type: 'RAILGUN_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP'
        })
      } else {
        dispatch({
          type: 'PRIVACY_POOLS_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP'
        })
      }
      
      // Reset hasProceeded for both controllers
      // to prevent double-click issue when withdrawing again
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
  }, [submittedAccountOp, dispatch, navigateOut, onPrimaryButtonPress, activeTab])

  const handleWithdrawal = useCallback(async () => {
    setIsSubmitting(true)
    try {
      await handleMultipleWithdrawal()
    } catch (error) {
      console.error('Withdrawal error:', error)
      addToast('Unable to generate proof for transfer. Please try again.', {
        type: 'error',
        timeout: 8000
      })
      setIsSubmitting(false)
    }
  }, [handleMultipleWithdrawal, addToast])

  const handleRailgunWithdrawal = useCallback(async () => {
    // Use synced state values (current input values) instead of controller state
    // Controller state may be debounced and not updated yet
    const amount = railgunAmountFieldValue || railgunWithdrawalAmount
    // Prioritize synced state field value, then ENS resolved address, then addressInputState.address
    const address = railgunAddressStateFieldValue || railgunAddressState.ensAddress || railgunAddressInputState.address
    
    // Debug logging
    console.log('handleRailgunWithdrawal - Input values:', {
      amount,
      address,
      amountFieldValue: railgunAmountFieldValue,
      withdrawalAmount: railgunWithdrawalAmount,
      addressStateFieldValue: railgunAddressStateFieldValue,
      addressInputStateAddress: railgunAddressInputState.address,
      addressStateEnsAddress: railgunAddressState.ensAddress,
      selectedToken: railgunSelectedToken
    })
    
    // Validate form inputs
    if (!railgunSelectedToken || !amount || !address) {
      console.error('Missing required form inputs:', {
        token: railgunSelectedToken,
        amount: amount,
        address: address,
        amountFieldValue: railgunAmountFieldValue,
        withdrawalAmount: railgunWithdrawalAmount,
        addressInputState: railgunAddressInputState.address,
        addressStateFieldValue: railgunAddressStateFieldValue,
        addressStateEnsAddress: railgunAddressState.ensAddress
      })
      return
    }

    // Get the synced default Railgun account instance directly from state
    console.log('Getting synced Railgun account from state...')
    const accountData = railgunForm.syncedDefaultRailgunAccount()
    if (!accountData) {
      console.error('Failed to get synced Railgun account. Ensure loadPrivateAccount has been called.')
      return
    }

    const { account, indexer } = accountData
    console.log('Railgun account instance ready:', { account, indexer })
    
    // Parse amount to BigInt using token decimals
    const tokenDecimals = railgunSelectedToken.decimals || 18
    const amountBigInt = parseUnits(amount, tokenDecimals)
    
    // Ensure address is properly formatted (checksummed)
    const receiver = getAddress(address)
    
    // Check if this is native ETH and user wants WETH instead
    // TODO: Get from checkbox state when WETH checkbox is implemented
    const withdrawAsWETH = false
    const isNativeETH = railgunSelectedToken.address?.toLowerCase() === ZERO_ADDRESS.toLowerCase()
    let txData
    
    try {
      if (isNativeETH && !withdrawAsWETH) {
        // Use native ETH unshield
        console.log('Calling account.unshieldNative with:', {
          amount: amountBigInt.toString(),
          receiver
        })
        txData = await account.unshieldNative(amountBigInt, receiver)
      } else {
        let tokenAddress = railgunSelectedToken.address
        
        // If native ETH but user wants WETH, use WETH address
        if (isNativeETH && withdrawAsWETH) {
          const networkConfig = RAILGUN_CONFIG_BY_CHAIN_ID[railgunChainId?.toString() as keyof typeof RAILGUN_CONFIG_BY_CHAIN_ID]
          if (!networkConfig?.WETH) {
            console.error('WETH address not found for chainId:', railgunChainId)
            return
          }
          tokenAddress = networkConfig.WETH
        }
        
        console.log('Calling account.unshield with:', {
          tokenAddress,
          amount: amountBigInt.toString(),
          receiver
        })
        txData = await account.unshield(tokenAddress, amountBigInt, receiver)
      }
      
      console.log('Unshield txData:', txData)
    } catch (error) {
      console.error('Error generating unshield transaction:', error)
      return
    }
    
    // Construct calls for signing operation
    // For withdrawals, we only need the unshield call (no approve needed)
    const requestId = randomId()
    
    // Add the unshield transaction call
    const call: Call ={
      to: getAddress(txData.to),
      data: txData.data,
      value: isNativeETH && !withdrawAsWETH ? BigInt(txData.value) : BigInt(0),
      fromUserRequestId: requestId
    };
    
    console.log('Constructed call for withdrawal:', call)
    
    try {
      // Sync the calls to the sign account op controller
      console.log('Syncing calls to sign account op controller...')
      await railgunForm.syncSignAccountOp([call])
      console.log('Calls synced successfully')
      
      // Open the estimation modal
      console.log('Opening estimation modal...')
      railgunForm.openEstimationModalAndDispatch()
      console.log('Estimation modal opened successfully')
    } catch (error) {
      console.error('Error syncing calls or opening modal:', error)
      return
    }
    
  }, [
    railgunForm,
    railgunSelectedToken,
    railgunAmountFieldValue,
    railgunWithdrawalAmount,
    railgunAddressInputState.address,
    railgunAddressStateFieldValue,
    railgunAddressState.ensAddress,
    railgunChainId
  ])

  // Handler functions for Estimation component
  const handleBroadcastAccountOp = useCallback(() => {
    dispatch({
      type: 'MAIN_CONTROLLER_HANDLE_SIGN_AND_BROADCAST_ACCOUNT_OP',
      params: {
        updateType: 'Railgun'
      }
    })
  }, [dispatch])

  const handleUpdateStatus = useCallback(
    (status: SigningStatus) => {
      dispatch({
        type: 'RAILGUN_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE_STATUS',
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
        type: 'RAILGUN_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE',
        params
      })
    },
    [dispatch]
  )

  const buttons = useMemo(() => {
    if (activeTab === 'railgun') {
      return (
        <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
          <BackButton onPress={onBack} />
          <Buttons
            handleSubmitForm={handleRailgunWithdrawal}
            proceedBtnText={t('Send')}
            isNotReadyToProceed={!isRailgunTransferFormValid}
            signAccountOpErrors={[]}
            networkUserRequests={[]}
            isLoading={false}
          />
        </View>
      )
    }

    return (
      <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
        <BackButton onPress={onBack} />
        <Buttons
          handleSubmitForm={handleWithdrawal}
          proceedBtnText={isRefreshing ? t('Updating...') : t('Send')}
          isNotReadyToProceed={!isTransferFormValid || isRefreshing}
          signAccountOpErrors={[]}
          networkUserRequests={[]}
          isLoading={isSubmitting || isRefreshing}
        />
      </View>
    )
  }, [
    onBack,
    isTransferFormValid,
    isRailgunTransferFormValid,
    t,
    isSubmitting,
    isRefreshing,
    handleWithdrawal,
    handleRailgunWithdrawal,
    activeTab
  ])

  // Refresh merkle tree and private account after successful withdrawal
  useEffect(() => {
    if (
      !hasRefreshedAccountRef.current &&
      (submittedAccountOp?.status === AccountOpStatus.Success ||
        submittedAccountOp?.status === AccountOpStatus.UnknownButPastNonce)
    ) {
      hasRefreshedAccountRef.current = true

      if (activeTab === 'railgun') {
        // For Railgun, use railgunForm's refreshPrivateAccount
        railgunForm.refreshPrivateAccount()
          .then(() => {
            setIsSubmitting(false)
          })
          .catch((error) => {
            // eslint-disable-next-line no-console
            console.error('Failed to refresh after Railgun withdrawal:', error)
            addToast('Failed to refresh your privacy account. Please try again.', { type: 'error' })
            setIsSubmitting(false)
          })
      } else {
        // For Privacy Pools
        refreshPrivateAccount(true)
          .then(() => {
            setIsSubmitting(false)
          })
          .catch((error) => {
            // eslint-disable-next-line no-console
            console.error('Failed to refresh after withdrawal:', error)
            addToast('Failed to refresh your privacy account. Please try again.', { type: 'error' })
            setIsSubmitting(false)
          })
      }
    }
  }, [submittedAccountOp?.status, refreshPrivateAccount, railgunForm, addToast, activeTab])

  if (displayedView === 'track') {
    return (
      <TrackProgress
        onPrimaryButtonPress={handlePrimaryButtonPress}
        handleClose={() => {
          // Clean up the appropriate controller based on active tab
          if (activeTab === 'railgun') {
            dispatch({
              type: 'RAILGUN_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP'
            })
          } else {
            dispatch({
              type: 'PRIVACY_POOLS_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP'
            })
          }

          // Reset hasProceeded for both controllers
          // to prevent double-click issue when withdrawing again
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

          navigateOut()
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
            title={t('Private Transfer done!')}
            titleSecondary={t('{{symbol}} sent!', {
              symbol: currentLatestBroadcastedToken?.symbol || 'Token'
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
              "We couldn't complete your transfer. Please try again later or contact Kohaku support."
            )}
          />
        )}
      </TrackProgress>
    )
  }

  return (
    <Wrapper title={headerTitle} buttons={buttons}>
      <Content buttons={buttons}>
        <Form>
          <Tabs activeTab={activeTab} onTabChange={setActiveTab} />
          {activeTab === 'privacy-pools' ? (
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
              quoteFee={relayerQuote?.estimatedFee || '0'}
              amountFieldMode={amountFieldMode}
              amountInFiat={amountInFiat}
              isRecipientAddressUnknownAgreed={isRecipientAddressUnknownAgreed || false}
              addressState={addressState}
              controllerAmount={withdrawalAmount}
              totalApprovedBalance={totalApprovedBalance}
              updateQuoteStatus={updateQuoteStatus}
              chainId={chainId ? BigInt(chainId) : BigInt(1)}
            />
          ) : (
            <RailgunTransferForm
              addressInputState={railgunAddressInputState}
              amountErrorMessage={railgunAmountErrorMessage}
              isRecipientAddressUnknown={railgunIsRecipientAddressUnknown}
              formTitle={formTitle}
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
            />
          )}
        </Form>
      </Content>

      <Estimation
        updateType="Railgun"
        estimationModalRef={railgunForm.estimationModalRef}
        closeEstimationModal={railgunForm.closeEstimationModal}
        updateController={updateController}
        handleUpdateStatus={handleUpdateStatus}
        handleBroadcastAccountOp={handleBroadcastAccountOp}
        hasProceeded={!!railgunForm.hasProceeded}
        signAccountOpController={railgunForm.signAccountOpController || null}
      />
    </Wrapper>
  )
}

export default React.memo(TransferScreen)
