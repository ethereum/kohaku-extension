/* eslint-disable no-console */
import { useCallback, useMemo, useState } from 'react'
import { useModalize } from 'react-native-modalize'
import { formatEther, getAddress } from 'viem'
import { Call } from '@ambire-common/libs/accountOp/types'
import { randomId } from '@ambire-common/libs/humanizer/utils'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useRailgunControllerState from '@web/hooks/useRailgunControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import { RailgunAccount } from '@kohaku-eth/railgun'

/**
 * Hook for managing Railgun privacy protocol operations
 * Handles deposits, withdrawals, and form state specific to Railgun
 */
const useRailgunForm = () => {
  const { dispatch } = useBackgroundService()
  const {
    chainId,
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
    currentRailgunKeys
  } = useRailgunControllerState()

  const { account: userAccount, portfolio } = useSelectedAccountControllerState()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const ethPrice = chainId
    ? portfolio.tokens
        .find((token) => token.chainId === BigInt(chainId) && token.name === 'Ether')
        ?.priceIn.find((price) => price.baseCurrency === 'usd')?.price
    : undefined

  // Railgun doesn't use pool accounts like Privacy Pools
  // These are placeholder values to maintain interface compatibility
  const totalApprovedBalance = useMemo(() => {
    return { total: 0n, accounts: [] }
  }, [])

  const totalPendingBalance = useMemo(() => {
    return { total: 0n, accounts: [] }
  }, [])

  const totalDeclinedBalance = useMemo(() => {
    return { total: 0n, accounts: [] }
  }, [])

  const totalPrivatePortfolio = useMemo(() => {
    const ethAmount = Number(formatEther(totalApprovedBalance.total))
    return ethAmount * (ethPrice || 0)
  }, [totalApprovedBalance, ethPrice])

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

  const handleDeposit = async () => {
    console.log('DEBUG: RAILGUN handleDeposit called')
    console.log('DEBUG: Deposit amount:', depositAmount)
    console.log('DEBUG: Chain ID:', chainId)
    console.log('DEBUG: User account:', userAccount?.addr)
    console.log('DEBUG: Privacy provider:', privacyProvider)
    if (!currentRailgunKeys) {
      console.log('DEBUG: No railgun keys found')
    } else {
      const railgunAccount = RailgunAccount.fromPrivateKeys(currentRailgunKeys?.spendingKey, currentRailgunKeys?.viewingKey, BigInt(chainId), currentRailgunKeys?.shieldKeySigner);

      const txData = await railgunAccount?.createNativeShieldTx(BigInt(depositAmount));
      console.log('DEBUG: Created native shield tx:', txData)

      // Normalize the Call object to match PrivacyPools format
      // Ensures: to is checksummed, data is 0x-prefixed string, value is bigint
      const call: Call = {
        to: getAddress(txData.to), // Checksum the address
        data: txData.data, // Already 0x-prefixed hex string from Railgun SDK
        value: BigInt(txData.value), // Ensure bigint type
        fromUserRequestId: randomId() // Required for proper action tracking
      }

      await syncSignAccountOp([call])
      console.log('DEBUG: About to open estimation modal')
      openEstimationModalAndDispatch()
      console.log('DEBUG: Estimation modal opened')
    }
  }

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
    totalPendingBalance,
    totalDeclinedBalance,
    totalPrivatePortfolio,
    ethPrivateBalance,
    isReadyToLoad,
    handleDeposit,
    handleMultipleRagequit,
    handleMultipleWithdrawal,
    handleUpdateForm,
    isRagequitLoading,
    closeEstimationModal,
    handleSelectedAccount,
    loadPrivateAccount,
    refreshPrivateAccount
  }
}

export default useRailgunForm
