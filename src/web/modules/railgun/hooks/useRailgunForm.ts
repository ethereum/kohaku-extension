import { useCallback, useMemo, useState } from 'react'
import { useModalize } from 'react-native-modalize'
import { formatEther, formatUnits, getAddress, parseUnits } from 'viem'
import { ZERO_ADDRESS } from '@ambire-common/services/socket/constants'
import { TokenResult } from '@ambire-common/libs/portfolio'
import { AddressState, AddressStateOptional } from '@ambire-common/interfaces/domains'
import useAddressInput from '@common/hooks/useAddressInput'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useControllerState from '@web/hooks/useControllerState'
import useRailgunControllerState from '@web/hooks/useRailgunControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'

// Railgun wraps native ETH into WETH on shield, so shielded ETH comes back from
// the SDK as the chain's WETH ERC20. Treat these (and native) as ETH for
// display/selection.
const WETH_ADDRESSES = new Set<string>([
  '0xfff9976782d46cc05630d1f6ebab18b2324d6b14', // Sepolia WETH
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' // Mainnet WETH
])

const USDC_ADDRESSES = new Set<string>([
  '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238', // Sepolia USDC
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // Mainnet USDC
  '0x0b2c639c533813f4aa9d7837caf62653d097ff85' // Optimism USDC
])

const useRailgunForm = () => {
  const { dispatch } = useBackgroundService()

  const {
    railgunAccountsState,
    isAccountLoaded,
    isLoadingAccount,
    isRefreshing,
    isReadyToLoad,
    loadPrivateAccount,
    refreshPrivateAccount
  } = useRailgunControllerState()

  const railgunV2State = useControllerState('railgunV2')
  const signAccountOpController = railgunV2State?.signAccountOpController ?? null
  const latestBroadcastedAccountOp = railgunV2State?.latestBroadcastedAccountOp ?? null
  const hasProceeded = !!railgunV2State?.hasProceeded
  // True for the whole unshield/transfer; drives the "Sending…"
  // (cleared by the controller's finally even if prepare fails — no stuck state).
  const privateOpInFlight = !!railgunV2State?.privateOpInFlight

  // privacyProvider is a shared tab toggle; the privacy-pools controller owns it.
  const privacyPoolsState = useControllerState('privacyPools')
  const privacyProvider = privacyPoolsState?.privacyProvider || 'railgun'

  const { account: userAccount, portfolio } = useSelectedAccountControllerState()

  const chainId = railgunAccountsState.chainId

  const [depositAmount, setDepositAmount] = useState<string>('')
  const [withdrawalAmount, setWithdrawalAmount] = useState<string>('')
  const [selectedToken, setSelectedToken] = useState<TokenResult | null>(null)
  const [amountFieldMode, setAmountFieldMode] = useState<'token' | 'fiat'>('token')
  const [isRecipientAddressUnknownAgreed, setIsRecipientAddressUnknownAgreed] = useState(false)
  const [withdrawAsWETH, setWithdrawAsWETH] = useState(false)
  const [programmaticUpdateCounter, setProgrammaticUpdateCounter] = useState(0)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [addressState, setAddressStateRaw] = useState<AddressState>({
    fieldValue: '',
    ensAddress: '',
    isDomainResolving: false
  })
  const setAddressState = useCallback((newState: AddressStateOptional) => {
    setAddressStateRaw((prev) => ({ ...prev, ...newState }))
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

  const resetForm = useCallback(() => {
    setDepositAmount('')
    setWithdrawalAmount('')
    setSelectedToken(null)
    setAmountFieldMode('token')
    setMessage(null)
    setAddressStateRaw({ fieldValue: '', ensAddress: '', isDomainResolving: false })
  }, [])

  const ethPrice = useMemo(() => {
    if (!chainId) return undefined
    return portfolio.tokens
      .find((token) => token.chainId === BigInt(chainId) && token.name === 'Ether')
      ?.priceIn.find((price) => price.baseCurrency === 'usd')?.price
  }, [chainId, portfolio.tokens])

  const totalApprovedBalance = useMemo(() => {
    if (railgunAccountsState.balances.length > 0) {
      let balance = BigInt(0)
      railgunAccountsState.balances.forEach((bal) => {
        if (bal.tokenAddress === ZERO_ADDRESS) {
          balance += BigInt(bal.amount)
        }
      })
      return { total: balance, accounts: [] }
    }
    return { total: 0n, accounts: [] }
  }, [railgunAccountsState])

  const totalPrivateBalancesFormatted = useMemo(() => {
    const railgunBalances = railgunAccountsState.balances
    const balanceMap: Record<
      string,
      { amount: string; decimals: number; symbol: string; name: string; price?: number }
    > = {}

    const currentChainId = BigInt(chainId || 0)

    railgunBalances.forEach((balance) => {
      const tokenAddressLower = balance.tokenAddress.toLowerCase()

      // Try to find a matching token in the user's portfolio (or global pinned list).
      let token = portfolio.tokens.find(
        (t) => t.chainId === currentChainId && t.address.toLowerCase() === tokenAddressLower
      )
      if (!token && typeof window !== 'undefined' && (window as any).pinnedTokens) {
        token = (window as any).pinnedTokens.find(
          (t: any) => t.chainId === currentChainId && t.address.toLowerCase() === tokenAddressLower
        )
      }

      const tokenPrice = token?.priceIn?.find((price) => price.baseCurrency === 'usd')?.price

      // ALWAYS include every balance — never drop a token just because it isn't
      // in the public portfolio (it may be fully shielded). Shielded native ETH
      // comes back as WETH, so show WETH (and native) as ETH.
      const isEthLike =
        tokenAddressLower === ZERO_ADDRESS.toLowerCase() || WETH_ADDRESSES.has(tokenAddressLower)

      if (isEthLike) {
        balanceMap[tokenAddressLower] = {
          amount: balance.amount,
          decimals: 18,
          symbol: 'ETH',
          name: 'Ethereum',
          price: tokenPrice
        }
      } else if (token) {
        balanceMap[tokenAddressLower] = {
          amount: balance.amount,
          decimals: token.decimals,
          symbol: token.symbol,
          name: token.name,
          price: tokenPrice
        }
      } else if (USDC_ADDRESSES.has(tokenAddressLower)) {
        balanceMap[tokenAddressLower] = {
          amount: balance.amount,
          decimals: 6,
          symbol: 'USDC',
          name: 'USD Coin',
          price: undefined
        }
      } else {
        balanceMap[tokenAddressLower] = {
          amount: balance.amount,
          decimals: 18,
          symbol: tokenAddressLower,
          name: 'Unknown Token',
          price: undefined
        }
      }
    })

    return balanceMap
  }, [railgunAccountsState, portfolio.tokens, chainId])

  const totalPendingBalance = useMemo(() => ({ total: 0n, accounts: [] }), [])
  const totalDeclinedBalance = useMemo(() => ({ total: 0n, accounts: [] }), [])

  const totalPrivatePortfolio = useMemo(() => {
    let totalUsdValue = 0
    Object.values(totalPrivateBalancesFormatted).forEach((token) => {
      if (token.price !== undefined) {
        const tokenAmount = Number(formatUnits(BigInt(token.amount), token.decimals))
        totalUsdValue += tokenAmount * token.price
      }
    })
    return totalUsdValue
  }, [totalPrivateBalancesFormatted])

  const ethPrivateBalance = useMemo(
    () => formatEther(totalApprovedBalance.total),
    [totalApprovedBalance]
  )

  // maxAmount: the private balance of the selected token (formatted).
  const maxAmount = useMemo(() => {
    if (!selectedToken) return '0'
    const selectedAddress = selectedToken.address.toLowerCase()
    const total = railgunAccountsState.balances
      .filter((b) => b.tokenAddress.toLowerCase() === selectedAddress)
      .reduce((sum, b) => sum + BigInt(b.amount), 0n)
    return formatUnits(total, selectedToken.decimals)
  }, [railgunAccountsState, selectedToken])

  // amountInFiat: withdrawal amount converted to USD.
  const amountInFiat = useMemo(() => {
    const num = parseFloat(withdrawalAmount)
    if (!num || !ethPrice) return '0'
    return (num * ethPrice).toFixed(2)
  }, [withdrawalAmount, ethPrice])

  const validationFormMsgs = useMemo(() => {
    const amount = (() => {
      if (!depositAmount || !selectedToken) return { success: false, message: '' }
      try {
        const formatted = formatUnits(BigInt(depositAmount), selectedToken.decimals)
        if (Number(formatted) <= 0)
          return { success: false, message: 'The amount must be greater than 0.' }
        return { success: true, message: '' }
      } catch {
        return { success: false, message: 'Invalid amount.' }
      }
    })()

    const recipientAddress = (() => {
      const addr = addressInputState.address || addressState.fieldValue
      if (!addr) return { success: false, message: '' }
      return { success: true, message: '' }
    })()

    return { amount, recipientAddress }
  }, [depositAmount, selectedToken, addressInputState.address, addressState.fieldValue])

  const { ref: estimationModalRef, open: openEstimationModal, close: closeModalRaw } = useModalize()

  const closeEstimationModal = useCallback(() => {
    dispatch({ type: 'RAILGUN_V2_CONTROLLER_DESTROY_SIGN_ACCOUNT_OP' })
    closeModalRaw()
  }, [dispatch, closeModalRaw])

  const handleUpdateForm = useCallback(
    (params: { [key: string]: any }) => {
      if (params.depositAmount !== undefined) setDepositAmount(params.depositAmount)
      if (params.withdrawalAmount !== undefined) {
        setWithdrawalAmount(params.withdrawalAmount)
        setProgrammaticUpdateCounter((c) => c + 1)
      }
      if (params.selectedToken !== undefined) setSelectedToken(params.selectedToken)
      if (params.amountFieldMode !== undefined) setAmountFieldMode(params.amountFieldMode)
      if (params.withdrawAsWETH !== undefined) setWithdrawAsWETH(params.withdrawAsWETH)
      if (params.isRecipientAddressUnknownAgreed !== undefined)
        setIsRecipientAddressUnknownAgreed(params.isRecipientAddressUnknownAgreed)
      if (params.addressState !== undefined) {
        setAddressState(params.addressState)
        setProgrammaticUpdateCounter((c) => c + 1)
      }

      // privacyProvider is a shared tab toggle owned by the privacy-pools controller.
      if (params.privacyProvider !== undefined) {
        dispatch({
          type: 'PRIVACY_POOLS_CONTROLLER_UPDATE_FORM',
          params: { privacyProvider: params.privacyProvider }
        })
      }

      setMessage(null)
    },
    [dispatch, setAddressState]
  )

  const openEstimationModalAndDispatch = useCallback(() => {
    dispatch({ type: 'RAILGUN_V2_CONTROLLER_HAS_USER_PROCEEDED', params: { proceeded: true } })
    openEstimationModal()
  }, [openEstimationModal, dispatch])

  /** Builds the SDK AssetAmount from the selected token (native vs erc20). */
  const buildAsset = useCallback((token: TokenResult, amount: bigint) => {
    const isNative = token.address.toLowerCase() === ZERO_ADDRESS.toLowerCase()
    return {
      asset: isNative
        ? ({ __type: 'native' } as const)
        : ({
            __type: 'erc20',
            contract: getAddress(token.address).toLowerCase() as `0x${string}`
          } as const),
      amount
    }
  }, [])

  const handleDeposit = useCallback(() => {
    if (!selectedToken) {
      setMessage({ type: 'error', text: 'No token selected. Please select a token.' })
      return
    }
    if (!depositAmount || depositAmount === '0') {
      setMessage({ type: 'error', text: 'Deposit amount is required.' })
      return
    }

    let amount: bigint
    try {
      // depositAmount is already in base units (wei) — do NOT re-apply decimals.
      amount = BigInt(depositAmount)
    } catch {
      setMessage({ type: 'error', text: `Invalid deposit amount "${depositAmount}".` })
      return
    }

    dispatch({
      type: 'RAILGUN_V2_CONTROLLER_SHIELD',
      params: { asset: buildAsset(selectedToken, amount) }
    })

    openEstimationModalAndDispatch()
    setMessage(null)
  }, [selectedToken, depositAmount, dispatch, buildAsset, openEstimationModalAndDispatch])

  const handleMultipleWithdrawal = useCallback(async () => {
    if (!selectedToken) {
      setMessage({ type: 'error', text: 'No token selected. Please select a token.' })
      return
    }
    if (!withdrawalAmount || Number(withdrawalAmount) <= 0) {
      setMessage({ type: 'error', text: 'Withdrawal amount is required.' })
      return
    }
    const to = addressInputState.address || addressState.ensAddress || addressState.fieldValue

    if (!to) {
      setMessage({ type: 'error', text: 'A recipient address is required.' })
      return
    }

    let amount: bigint
    try {
      amount = parseUnits(withdrawalAmount, selectedToken.decimals)
    } catch {
      setMessage({ type: 'error', text: `Invalid withdrawal amount "${withdrawalAmount}".` })
      return
    }

    const asset = buildAsset(selectedToken, amount)
    const isRailgunRecipient = to.toLowerCase().startsWith('0zk')

    const toParam = isRailgunRecipient ? (to as `0zk${string}`) : getAddress(to)

    dispatch({
      type: 'RAILGUN_V2_CONTROLLER_SUBMIT_PRIVATE_OP',
      params: { asset, to: toParam }
    })
  }, [
    selectedToken,
    withdrawalAmount,
    addressInputState.address,
    addressState.ensAddress,
    addressState.fieldValue,
    dispatch,
    buildAsset
  ])

  // Railgun has no ragequit / pool-account concepts.
  const handleMultipleRagequit = useCallback(async () => {}, [])
  const handleSelectedAccount = useCallback(() => {}, [])
  const isRagequitLoading = useCallback(() => false, [])

  return {
    chainId,
    ethPrice,
    message,
    poolInfo: undefined,
    chainData: undefined,
    seedPhrase: undefined,
    poolAccounts: [],
    hasProceeded,
    privateOpInFlight,
    depositAmount,
    accountService: undefined,
    withdrawalAmount,
    amountFieldMode,
    setAmountFieldMode,
    amountInFiat,
    maxAmount,
    withdrawAsWETH,
    programmaticUpdateCounter,
    isRecipientAddressUnknown: false,
    isRecipientAddressUnknownAgreed,
    setIsRecipientAddressUnknownAgreed,
    latestBroadcastedToken: null,
    addressState,
    setAddressState,
    addressInputState,
    privacyProvider,
    selectedToken,
    showAddedToBatch: false,
    estimationModalRef,
    selectedPoolAccount: null,
    signAccountOpController,
    latestBroadcastedAccountOp,
    isLoading: isLoadingAccount,
    isRefreshing,
    isAccountLoaded,
    totalApprovedBalance,
    totalPrivateBalancesFormatted,
    totalPendingBalance,
    totalDeclinedBalance,
    totalPrivatePortfolio,
    ethPrivateBalance,
    isReadyToLoad,
    isReady: true,
    validationFormMsgs,
    userAccount,
    handleDeposit,
    handleMultipleRagequit,
    handleMultipleWithdrawal,
    handleUpdateForm,
    isRagequitLoading,
    closeEstimationModal,
    handleSelectedAccount,
    resetForm,
    loadPrivateAccount,
    refreshPrivateAccount,
    openEstimationModalAndDispatch
  }
}

export default useRailgunForm
