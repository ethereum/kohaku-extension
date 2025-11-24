/* eslint-disable no-console */
import { useCallback, useMemo, useState } from 'react'
import { useModalize } from 'react-native-modalize'
import { formatEther, formatUnits, getAddress } from 'viem'
import { ZERO_ADDRESS } from '@ambire-common/services/socket/constants'
import { Call } from '@ambire-common/libs/accountOp/types'
import { randomId } from '@ambire-common/libs/humanizer/utils'
import { PINNED_TOKENS } from '@ambire-common/consts/pinnedTokens'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useRailgunControllerState from '@web/hooks/useRailgunControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import {
  createRailgunAccount,
  createRailgunIndexer,
  getRailgunAddress,
  RAILGUN_CONFIG_BY_CHAIN_ID,
  type RailgunAccount,
  type Indexer
} from '@kohaku-eth/railgun'
import { Interface } from 'ethers'

const ERC20 = new Interface(["function approve(address spender, uint256 amount) external returns (bool)"]);

/**
 * Hook for managing Railgun privacy protocol operations
 * Handles deposits, withdrawals, and form state specific to Railgun
 */
const useRailgunForm = () => {
  const { dispatch } = useBackgroundService()
  const {
    chainId,
    validationFormMsgs,
    hasProceeded,
    depositAmount,
    withdrawalAmount,
    signAccountOpController,
    latestBroadcastedAccountOp,
    isAccountLoaded,
    isLoadingAccount,
    isRefreshing,
    isReadyToLoad,
    privacyProvider,
    loadPrivateAccount,
    refreshPrivateAccount,
    getAccountCache,
    defaultRailgunKeys,
    syncedDefaultRailgunAccount,
    syncedDefaultRailgunIndexer,
    railgunAccountsState,
    selectedToken
  } = useRailgunControllerState()

  const { account: userAccount, portfolio } = useSelectedAccountControllerState()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const ethPrice = chainId
    ? portfolio.tokens
        .find((token) => token.chainId === BigInt(chainId) && token.name === 'Ether')
        ?.priceIn.find((price) => price.baseCurrency === 'usd')?.price
    : undefined

  const totalApprovedBalance = useMemo(() => {
    if (railgunAccountsState.balances.length > 0) {
      let balance = BigInt(0);
      for (const bal of railgunAccountsState.balances) {
        if (bal.tokenAddress === ZERO_ADDRESS) {
          balance += BigInt(bal.amount);
        }
      }
      return { total: balance, accounts: []}
    }
    return { total: 0n, accounts: [] }
  }, [railgunAccountsState])

  const totalPrivateBalancesFormatted = useMemo(() => {
    const railgunBalances = railgunAccountsState.balances;
    const balanceMap: Record<string, { amount: string; decimals: number; symbol: string; name: string; price?: number }> = {};
    
    for (const balance of railgunBalances) {
      const tokenAddressLower = balance.tokenAddress.toLowerCase();
      const currentChainId = BigInt(chainId || 0);
      
      // Try to find a matching token in user's portfolio first
      let token = portfolio.tokens.find(
        (t) => 
          t.chainId === currentChainId && 
          t.address.toLowerCase() === tokenAddressLower
      );

      // If not found, try to find it in pinnedTokens (global pinned list)
      if (!token && typeof window !== 'undefined' && (window as any).pinnedTokens) {
        token = (window as any).pinnedTokens.find(
          (t: any) =>
            t.chainId === currentChainId &&
            t.address.toLowerCase() === tokenAddressLower
        );
      }

      // If still not found, check if it's a pinned token (from PINNED_TOKENS constant)
      // For pinned tokens, we should show them even if not in current portfolio
      const isPinned = PINNED_TOKENS.some(
        (pinned) =>
          pinned.chainId === currentChainId &&
          pinned.address.toLowerCase() === tokenAddressLower
      );

      // If we have token metadata, use it
      if (token) {
        const tokenPrice = token.priceIn?.find((price) => price.baseCurrency === 'usd')?.price;
        balanceMap[tokenAddressLower] = { 
          amount: balance.amount,
          decimals: token.decimals,
          symbol: token.symbol,
          name: token.name,
          price: tokenPrice,
        };
      } else if (isPinned) {
        // For pinned tokens without metadata, use fallback info
        // Common token decimals: USDC/USDT = 6, most others = 18
        const isUSDC = tokenAddressLower === '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' || // Mainnet USDC
                       tokenAddressLower === '0x0b2c639c533813f4aa9d7837caf62653d097ff85' || // Optimism USDC
                       tokenAddressLower === '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238'; // Sepolia USDC
        const isNative = tokenAddressLower === ZERO_ADDRESS.toLowerCase();
        
        balanceMap[tokenAddressLower] = {
          amount: balance.amount,
          decimals: isUSDC ? 6 : (isNative ? 18 : 18), // Default to 18, 6 for USDC
          symbol: isNative ? 'ETH' : (isUSDC ? 'USDC' : 'Unknown'),
          name: isNative ? 'Ethereum' : (isUSDC ? 'USD Coin' : 'Unknown Token'),
          price: undefined, // No price available without portfolio data
        };
      }
      // If not found in portfolio, not in window.pinnedTokens, and not pinned, skip it
      // This maintains the current behavior for non-pinned tokens
    }
    
    return balanceMap;
  }, [railgunAccountsState, portfolio.tokens, chainId])

  const totalPendingBalance = useMemo(() => {
    return { total: 0n, accounts: [] }
  }, [])

  const totalDeclinedBalance = useMemo(() => {
    return { total: 0n, accounts: [] }
  }, [])

  const totalPrivatePortfolio = useMemo(() => {
    let totalUsdValue = 0
    
    for (const tokenAddress in totalPrivateBalancesFormatted) {
      const token = totalPrivateBalancesFormatted[tokenAddress]
      if (token.price !== undefined) {
        const tokenAmount = Number(formatUnits(BigInt(token.amount), token.decimals))
        totalUsdValue += tokenAmount * token.price
      }
    }
    
    return totalUsdValue
  }, [totalPrivateBalancesFormatted])

  const ethPrivateBalance = useMemo(() => {
    return formatEther(totalApprovedBalance.total)
  }, [totalApprovedBalance])

  const {
    ref: estimationModalRef,
    open: openEstimationModal,
    close: closeEstimationModal
  } = useModalize()

  const handleUpdateForm = useCallback(
    (params: { [key: string]: any }) => {
      dispatch({
        type: 'RAILGUN_CONTROLLER_UPDATE_FORM',
        params: { ...params }
      })

      // If privacyProvider is being updated, sync it to Privacy Pools controller as well
      if (params.privacyProvider !== undefined) {
        dispatch({
          type: 'PRIVACY_POOLS_CONTROLLER_UPDATE_FORM',
          params: { privacyProvider: params.privacyProvider }
        })
      }

      setMessage(null)
    },
    [dispatch]
  )

  const openEstimationModalAndDispatch = useCallback(() => {
    dispatch({
      type: 'RAILGUN_CONTROLLER_HAS_USER_PROCEEDED',
      params: {
        proceeded: true
      }
    })
    openEstimationModal()
  }, [openEstimationModal, dispatch])

  const syncSignAccountOp = useCallback(
    async (calls: Call[]) => {
      console.log('DEBUG: syncSignAccountOp called with calls:', calls)
      dispatch({
        type: 'RAILGUN_CONTROLLER_SYNC_SIGN_ACCOUNT_OP',
        params: { calls }
      })
    },
    [dispatch]
  )

  const directBroadcastWithdrawal = useCallback(
    async (params: { to: string; data: string; value: string; chainId: number; isInternalTransfer?: boolean }): Promise<void> => {
      dispatch({
        type: 'RAILGUN_CONTROLLER_DIRECT_BROADCAST_WITHDRAWAL',
        params
      })
    },
    [dispatch]
  )

  const handleDeposit = async () => {
    console.log('DEBUG: RAILGUN handleDeposit called')
    console.log('DEBUG: Deposit amount:', depositAmount)
    console.log('DEBUG: Chain ID:', chainId)
    console.log('DEBUG: User account:', userAccount?.addr)
    console.log('DEBUG: selectedToken:', selectedToken)
    if (!defaultRailgunKeys) {
      console.log('DEBUG: No railgun keys found')
    } else {
      const railgunAccount = await createRailgunAccount({
        credential: { type: 'key', spendingKey: defaultRailgunKeys?.spendingKey, viewingKey: defaultRailgunKeys?.viewingKey, ethKey: defaultRailgunKeys?.shieldKeySigner },
        indexer: await createRailgunIndexer({
          network: RAILGUN_CONFIG_BY_CHAIN_ID[chainId.toString() as keyof typeof RAILGUN_CONFIG_BY_CHAIN_ID],
        }),
      });

      console.log("try IsEth");
      const isEth = selectedToken?.address ? selectedToken.address === ZERO_ADDRESS : true;
      console.log("IsEth:", isEth)
      const txData = isEth ? await railgunAccount?.shieldNative(BigInt(depositAmount)) : await railgunAccount?.shield(selectedToken.address, BigInt(depositAmount));

      console.log('DEBUG: isETH?', isEth)
      console.log('DEBUG: Created shield tx:', txData)

      let calls: Call[] = [];
      const requestId = randomId();
      if (!isEth) {
        calls.push({
          to: getAddress(selectedToken.address),
          data: ERC20.encodeFunctionData('approve', [txData.to, depositAmount]),
          value: BigInt(0),
          fromUserRequestId: requestId
        })
      }
      calls.push({
        to: getAddress(txData.to),
        data: txData.data,
        value: isEth ? BigInt(txData.value) : BigInt(0),
        fromUserRequestId: requestId
      })

      await syncSignAccountOp(calls)
      console.log('DEBUG: About to open estimation modal')
      openEstimationModalAndDispatch()
      console.log('DEBUG: Estimation modal opened')
    }
  }

  /**
   * Gets the synced Railgun account instance directly from context state
   * The account is created and stored during loadPrivateAccount/refreshPrivateAccount
   * This avoids the need to reconstitute from cache
   */
  const getSyncedDefaultRailgunAccount = useCallback((): {
    account: RailgunAccount
    indexer: Indexer
  } | null => {
    if (!syncedDefaultRailgunAccount || !syncedDefaultRailgunIndexer) {
      console.warn('[useRailgunForm] Synced account not available. Ensure loadPrivateAccount has been called first.')
      return null
    }

    return {
      account: syncedDefaultRailgunAccount,
      indexer: syncedDefaultRailgunIndexer
    }
  }, [syncedDefaultRailgunAccount, syncedDefaultRailgunIndexer])

  const handleMultipleWithdrawal = useCallback(async () => {
    console.log('RAILGUN WITHDRAWAL: Implementation coming soon')
    console.log('Withdrawal amount:', withdrawalAmount)
    console.log('Chain ID:', chainId)

    // TODO: Implement Railgun withdrawal logic
    // This will involve:
    // 1. Generating Railgun unshield proof
    // 2. Creating the withdrawal transaction
    // 3. Calling syncSignAccountOp with the transaction
    // 4. Opening the estimation modal

    setMessage({ type: 'error', text: 'Railgun withdrawals not yet implemented' })
  }, [chainId, withdrawalAmount])

  // Railgun doesn't have ragequit functionality like Privacy Pools
  const handleMultipleRagequit = useCallback(async () => {
    console.log('Ragequit not applicable for Railgun')
  }, [])

  // Railgun doesn't use pool accounts
  const handleSelectedAccount = () => {
    console.log('Account selection not applicable for Railgun')
  }

  const isRagequitLoading = () => false

  return {
    chainId,
    ethPrice,
    message,
    poolInfo: undefined, // Railgun doesn't have poolInfo
    chainData: undefined,
    seedPhrase: undefined,
    poolAccounts: [], // Railgun doesn't have pool accounts
    hasProceeded,
    depositAmount,
    accountService: undefined,
    withdrawalAmount,
    privacyProvider,
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
    validationFormMsgs,
    handleDeposit,
    handleMultipleRagequit,
    handleMultipleWithdrawal,
    handleUpdateForm,
    isRagequitLoading,
    closeEstimationModal,
    handleSelectedAccount,
    loadPrivateAccount,
    refreshPrivateAccount,
    syncedDefaultRailgunAccount: getSyncedDefaultRailgunAccount,
    syncSignAccountOp,
    openEstimationModalAndDispatch,
    directBroadcastWithdrawal
  }
}

export default useRailgunForm
