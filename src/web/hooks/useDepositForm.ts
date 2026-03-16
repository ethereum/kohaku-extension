/**
 * Wrapper hook that routes to the appropriate privacy protocol form hook
 * based on the selected provider (Privacy Pools or Railgun).
 *
 * This allows both protocols to maintain independent state and prevents
 * mixing of concerns between different privacy protocols.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useModalize } from 'react-native-modalize'
import { formatEther, formatUnits, parseUnits, toHex } from 'viem'
import type { PPv1Address, PPv1AssetAmount } from '@kohaku-eth/privacy-pools'

import useRailgunForm from '@web/modules/railgun/hooks/useRailgunForm'
import { validateSendTransferAddress } from '@ambire-common/services/privacyPools/validations'
import { TokenResult } from '@ambire-common/libs/portfolio'
import { getTokenAmount } from '@ambire-common/libs/portfolio/helpers'
import { INote } from '@ambire-common/controllers/privacyPools/privacyPoolsV1'
import { AddressState, AddressStateOptional } from '@ambire-common/interfaces/domains'
import useAddressInput from '@common/hooks/useAddressInput'
import useBackgroundService from './useBackgroundService'
import useRailgunControllerState from './useRailgunControllerState'
import usePrivacyPools from './usePrivacyPools/usePrivacyPools'
import useSelectedAccountControllerState from './useSelectedAccountControllerState'

export interface UpdateFormParams {
  depositAmount: string
  withdrawalAmount: string
  hasProceeded: boolean
  selectedToken: TokenResult | null
  addressState: AddressState
}

export const usePrivacyPoolsDepositForm = () => {
  // balance/sync/notes come from usePrivacyPools (the context wrapper)
  const {
    balance,
    sync,
    isReady,
    isSynced,
    initializationError,
    pendingNotes,
    approvedNotes,
    state: controllerState,
    isUnshielding,
    prepareUnshield,
    unshield,
    pendingUnshieldOperation,
    hasProceeded,
    latestBroadcastedAccountOp,
    signAccountOpController
  } = usePrivacyPools()

  const { portfolio } = useSelectedAccountControllerState()
  const { dispatch } = useBackgroundService()
  const { ref: estimationModalRef, open: openEstimationModal, close: closeModalRaw } = useModalize()

  const closeEstimationModal = useCallback(() => {
    dispatch({ type: 'PRIVACY_POOLS_CONTROLLER_DESTROY_SIGN_ACCOUNT_OP' })
    closeModalRaw()
  }, [dispatch, closeModalRaw])

  const [depositAmount, setDepositAmount] = useState<string>('')
  const [withdrawalAmount, setWithdrawalAmount] = useState<string>('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [selectedToken, setselectedToken] = useState<TokenResult | null>(null)
  const [amountFieldMode, setAmountFieldMode] = useState<'token' | 'fiat'>('token')
  const [isRecipientAddressUnknownAgreed, setIsRecipientAddressUnknownAgreed] = useState(false)
  const [latestBroadcastedToken, setLatestBroadcastedToken] = useState<TokenResult | null>(null)
  const [programmaticUpdateCounter, setProgrammaticUpdateCounter] = useState(0)

  const [addressState, setAddressStateRaw] = useState<AddressState>({
    fieldValue: '',
    ensAddress: '',
    isDomainResolving: false
  })

  const setAddressState = useCallback((newState: AddressStateOptional) => {
    setAddressStateRaw((prev) => ({ ...prev, ...newState }))
  }, [])

  const resetForm = useCallback(() => {
    setDepositAmount('')
    setWithdrawalAmount('')
    setMessage(null)
    setselectedToken(null)
    setAmountFieldMode('token')
    setIsRecipientAddressUnknownAgreed(false)
    setProgrammaticUpdateCounter(0)
    setAddressStateRaw({ fieldValue: '', ensAddress: '', isDomainResolving: false })
  }, [])

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleCacheResolvedDomain = useCallback((..._args: [string, string, 'ens']) => {}, [])

  const addressInputState = useAddressInput({
    addressState,
    setAddressState,
    overwriteError: '',
    overwriteValidLabel: '',
    handleCacheResolvedDomain
  })

  const handleUpdateForm = useCallback(
    (params: Partial<UpdateFormParams>) => {
      if (params.depositAmount !== undefined) setDepositAmount(params.depositAmount)
      if (params.withdrawalAmount !== undefined) {
        setWithdrawalAmount(params.withdrawalAmount)
        setProgrammaticUpdateCounter((c) => c + 1)
      }
      if (params.selectedToken !== undefined) setselectedToken(params.selectedToken)
      if (params.addressState !== undefined) {
        setAddressState(params.addressState)
        setProgrammaticUpdateCounter((c) => c + 1)
      }
      setMessage(null)
    },
    [setAddressState]
  )

  const ethPrice = useMemo(() => {
    return portfolio.tokens
      .find((token) => token.name === 'Ether')
      ?.priceIn.find((price) => price.baseCurrency === 'usd')?.price
  }, [portfolio.tokens])

  const totalApprovedBalance = useMemo(() => {
    const total = approvedNotes.reduce((sum: bigint, b: INote) => sum + b.balance, 0n)
    return { total, accounts: approvedNotes }
  }, [approvedNotes])

  const totalPendingBalance = useMemo(() => {
    const total = pendingNotes.reduce((sum: bigint, b: INote) => sum + b.balance, 0n)
    return { total, accounts: pendingNotes }
  }, [pendingNotes])

  const totalDeclinedBalance = useMemo(() => ({ total: 0n, accounts: [] }), [])

  const ethPrivateBalance = useMemo(
    () => formatEther(totalApprovedBalance.total),
    [totalApprovedBalance.total]
  )

  const totalPrivatePortfolio = useMemo(
    () => Number(ethPrivateBalance) * (ethPrice || 0),
    [ethPrivateBalance, ethPrice]
  )

  const supportedAssets = useMemo(() => new Set(balance.map((b) => b.asset.contract)), [balance])

  const emptyImportedBalance = useMemo(() => ({ total: 0n, accounts: [] }), [])

  // isRefreshing: true while the controller is fetching a new unshield quote
  const isRefreshing = useMemo(() => controllerState === 'preparing-unshield', [controllerState])

  const maxAmount = useMemo(() => {
    if (!selectedToken || approvedNotes.length === 0) return '0'

    const selectedAddress = selectedToken.address.toLowerCase()
    const notesForToken = approvedNotes.filter(
      (note) => toHex(note.assetAddress, { size: 20 }).toLowerCase() === selectedAddress
    )
    if (notesForToken.length === 0) return '0'

    const biggestNote = notesForToken.reduce(
      (biggest, note) => (note.balance > biggest.balance ? note : biggest),
      notesForToken[0]
    )
    return formatUnits(biggestNote.balance, selectedToken.decimals)
  }, [approvedNotes, selectedToken])

  // amountInFiat: withdrawal amount converted to USD
  const amountInFiat = useMemo(() => {
    const num = parseFloat(withdrawalAmount)
    if (!num || !ethPrice) return '0'
    return (num * ethPrice).toFixed(2)
  }, [withdrawalAmount, ethPrice])

  // relayerQuote: derived from the pending unshield operation's relay data
  const relayerQuote = useMemo(() => {
    if (!pendingUnshieldOperation) return null
    const feeBps = (pendingUnshieldOperation.rawData.relayData as any).relayFeeBps
    const estimatedFee = formatEther(
      BigInt(pendingUnshieldOperation.quoteData.quote.detail.relayTxCost.eth)
    )
    return {
      relayFeeBPS: Number(feeBps),
      estimatedFee
    }
  }, [pendingUnshieldOperation])

  // updateQuoteStatus: re-fetches the quote by calling prepareUnshield with current form values
  const updateQuoteStatus = useCallback(() => {
    if (!selectedToken || !withdrawalAmount || !addressInputState.address) return
    const asset: PPv1AssetAmount = {
      asset: { contract: selectedToken.address as `0x${string}`, __type: 'erc20' },
      amount: parseUnits(withdrawalAmount, selectedToken.decimals)
    }
    prepareUnshield(asset, addressInputState.address as PPv1Address)
  }, [selectedToken, withdrawalAmount, addressInputState.address, prepareUnshield])

  // Auto-fetch the quote whenever the form inputs are valid and complete
  useEffect(() => {
    if (!selectedToken || !withdrawalAmount || parseFloat(withdrawalAmount) <= 0) return
    if (!addressInputState.address || addressInputState.validation.isError) return

    const timeout = setTimeout(() => updateQuoteStatus(), 400)
    return () => clearTimeout(timeout)
  }, [
    selectedToken,
    withdrawalAmount,
    addressInputState.address,
    addressInputState.validation.isError,
    updateQuoteStatus
  ])

  const handleDeposit = useCallback(() => {
    if (!depositAmount || !selectedToken) return

    dispatch({
      type: 'PRIVACY_POOLS_V1_CONTROLLER_PREPARE_SHIELD',
      params: {
        asset: {
          asset: { contract: selectedToken.address as `0x${string}`, __type: 'erc20' },
          amount: BigInt(depositAmount)
        }
      }
    })

    dispatch({
      type: 'PRIVACY_POOLS_V1_CONTROLLER_HAS_USER_PROCEEDED',
      params: { proceeded: true }
    })

    openEstimationModal()
  }, [depositAmount, selectedToken, dispatch, openEstimationModal])

  const validationFormMsgs = useMemo(() => {
    const amount = (() => {
      if (!depositAmount || !selectedToken) return { success: false, message: '' }
      try {
        const formatted = formatUnits(BigInt(depositAmount), selectedToken.decimals)
        if (Number(formatted) <= 0)
          return { success: false, message: 'The amount must be greater than 0.' }

        const tokenInPortfolio = portfolio.tokens.find(
          (t) =>
            t.chainId === selectedToken.chainId &&
            t.address.toLowerCase() === selectedToken.address.toLowerCase()
        )
        const tokenBalance = tokenInPortfolio ? getTokenAmount(tokenInPortfolio) : 0n
        if (BigInt(depositAmount) > tokenBalance)
          return { success: false, message: 'Insufficient balance.' }

        return { success: true, message: '' }
      } catch {
        return { success: false, message: 'Invalid amount.' }
      }
    })()

    // isRecipientAddressUnknown is always false for PPv1 (no address book requirement)
    const recipientAddress = validateSendTransferAddress(
      addressInputState.address || '',
      '',
      isRecipientAddressUnknownAgreed,
      false,
      false,
      !!addressState.ensAddress,
      addressState.isDomainResolving
    )

    return { amount, recipientAddress }
  }, [
    depositAmount,
    selectedToken,
    portfolio.tokens,
    addressInputState.address,
    isRecipientAddressUnknownAgreed,
    addressState.ensAddress,
    addressState.isDomainResolving
  ])

  const handleMultipleRagequit = useCallback(async () => {
    throw new Error('handleMultipleRagequit: not yet implemented in usePrivacyPoolsDepositForm')
  }, [])

  const handleSelectedAccount = useCallback(() => {
    // TODO: implement with notes support
  }, [])

  const loadPrivateAccount = useCallback(async () => {
    sync()
  }, [sync])

  const refreshPrivateAccount = useCallback(async () => {
    sync()
  }, [sync])

  const isRagequitLoading = useCallback(() => false, [])

  return {
    chainId: 0n,
    supportedAssets,
    ethPrice,
    message,
    poolInfo: null,
    chainData: null,
    seedPhrase: null,
    poolAccounts: [],
    hasProceeded,
    depositAmount,
    selectedToken,
    accountService: null,
    withdrawalAmount,
    privacyProvider: 'privacy-pools' as const,
    showAddedToBatch: false,
    estimationModalRef,
    selectedPoolAccount: null,
    signAccountOpController,
    latestBroadcastedAccountOp,
    isLoading: !isReady,
    isReady,
    isRefreshing,
    isAccountLoaded: isSynced,
    isLoadingAnonymitySet: false,
    totalApprovedBalance,
    totalPendingBalance,
    totalDeclinedBalance,
    totalPrivatePortfolio,
    ethPrivateBalance,
    totalImportedApprovedBalance: emptyImportedBalance,
    totalImportedPendingBalance: emptyImportedBalance,
    totalImportedDeclinedBalance: emptyImportedBalance,
    totalImportedPrivatePortfolio: 0,
    ethImportedPrivateBalance: '0',
    importedAccountsWithNames: {},
    validationFormMsgs,
    isReadyToLoad: isReady,
    loadingError: initializationError,
    loadingSelectionAlgorithm: false,
    latestBroadcastedToken,
    handleDeposit,
    handleMultipleRagequit,
    handleUpdateForm,
    isRagequitLoading,
    closeEstimationModal,
    handleSelectedAccount,
    loadPrivateAccount,
    refreshPrivateAccount,
    addressState,
    setAddressState,
    addressInputState,
    amountFieldMode,
    setAmountFieldMode,
    amountInFiat,
    isRecipientAddressUnknown: false,
    isRecipientAddressUnknownAgreed,
    setIsRecipientAddressUnknownAgreed,
    maxAmount,
    programmaticUpdateCounter,
    relayerQuote,
    updateQuoteStatus,
    unshield,
    isUnshielding,
    resetForm
  } as const
}

const useDepositForm = () => {
  // Get the privacy provider setting from Privacy Pools controller
  // (both controllers share this setting)
  const { privacyProvider } = useRailgunControllerState()
  const { dispatch } = useBackgroundService()

  // IMPORTANT: Always call both hooks unconditionally to maintain consistent hook order
  // This prevents React's "Hooks called in different order" error
  const privacyPoolsForm = usePrivacyPoolsDepositForm()
  const railgunForm = useRailgunForm()

  // Route to the appropriate hook based on the selected provider
  // Default to railgun if not set
  const activeProvider = privacyProvider || 'railgun'

  // Wrap handleUpdateForm to intercept privacyProvider changes
  const wrappedHandleUpdateForm = useCallback(
    (params: any) => {
      // If privacyProvider is being updated, dispatch to both controllers
      if (params.privacyProvider !== undefined) {
        dispatch({
          type: 'RAILGUN_CONTROLLER_UPDATE_FORM',
          params: { privacyProvider: params.privacyProvider }
        })
        dispatch({
          type: 'PRIVACY_POOLS_CONTROLLER_UPDATE_FORM',
          params: { privacyProvider: params.privacyProvider }
        })
      }

      // Call the original handleUpdateForm from the appropriate form
      // We need to determine which form to use based on the current provider
      if ((privacyProvider || 'railgun') === 'railgun') {
        railgunForm.handleUpdateForm(params)
      } else {
        privacyPoolsForm.handleUpdateForm(params)
      }
    },
    [dispatch, privacyProvider, railgunForm, privacyPoolsForm]
  )

  if (activeProvider === 'railgun') {
    return {
      ...railgunForm,
      handleUpdateForm: wrappedHandleUpdateForm,
      supportedAssets: new Set<string>(),
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      resetForm: () => {}
    }
  }

  return {
    ...privacyPoolsForm,
    handleUpdateForm: wrappedHandleUpdateForm
  }
}

export default useDepositForm
