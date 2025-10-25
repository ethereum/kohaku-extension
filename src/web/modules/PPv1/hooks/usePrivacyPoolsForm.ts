/* eslint-disable no-console */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useModalize } from 'react-native-modalize'
import { encodeFunctionData, formatEther, getAddress, parseUnits } from 'viem'
import { Hash, type Withdrawal } from '@0xbow/privacy-pools-core-sdk'
import { Call } from '@ambire-common/libs/accountOp/types'
import { BatchWithdrawalParams } from '@ambire-common/controllers/privacyPools/privacyPools'
import { PoolAccount, ReviewStatus } from '@web/contexts/privacyPoolsControllerStateContext'
import useBackgroundService from '@web/hooks/useBackgroundService'
import usePrivacyPoolsControllerState from '@web/hooks/usePrivacyPoolsControllerState'
import useRailgunControllerState from '@web/hooks/useRailgunControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import { prepareWithdrawalProofInput, transformProofForRelayerApi } from '../utils/withdrawal'
import { transformRagequitProofForContract } from '../utils/ragequit'
import { entrypointAbi, privacyPoolAbi } from '../utils/abi'

const usePrivacyPoolsForm = () => {
  const { dispatch } = useBackgroundService()

  // Get both controller states
  const privacyPoolsState = usePrivacyPoolsControllerState()
  const railgunState = useRailgunControllerState()

  // Select the active controller based on privacyProvider
  // Default to privacy-pools if not set
  const activeProvider = privacyPoolsState.privacyProvider || 'privacy-pools'
  const activeState = activeProvider === 'railgun' ? railgunState : privacyPoolsState

  // Destructure common properties from active state
  const {
    hasProceeded,
    depositAmount,
    withdrawalAmount,
    signAccountOpController,
    latestBroadcastedAccountOp,
    isAccountLoaded,
    isReadyToLoad,
    loadPrivateAccount,
    refreshPrivateAccount,
    privacyProvider,
    chainId
  } = activeState

  // Conditionally get Privacy Pools specific properties
  const mtRoots = activeProvider === 'privacy-pools' ? privacyPoolsState.mtRoots : undefined
  const mtLeaves = activeProvider === 'privacy-pools' ? privacyPoolsState.mtLeaves : undefined
  const chainData = activeProvider === 'privacy-pools' ? privacyPoolsState.chainData : undefined
  const seedPhrase = activeProvider === 'privacy-pools' ? privacyPoolsState.seedPhrase : undefined
  const poolAccounts = activeProvider === 'privacy-pools' ? privacyPoolsState.poolAccounts : []
  const accountService = activeProvider === 'privacy-pools' ? privacyPoolsState.accountService : undefined
  const selectedPoolAccount = activeProvider === 'privacy-pools' ? privacyPoolsState.selectedPoolAccount : null
  const isLoadingAccount = activeProvider === 'privacy-pools' ? privacyPoolsState.isLoadingAccount : false
  const isRefreshing = activeProvider === 'privacy-pools' ? privacyPoolsState.isRefreshing : false
  const recipientAddress = activeProvider === 'privacy-pools' ? privacyPoolsState.recipientAddress : undefined
  const relayerQuote = activeProvider === 'privacy-pools' ? privacyPoolsState.relayerQuote : undefined
  const getContext = activeProvider === 'privacy-pools' ? privacyPoolsState.getContext : undefined
  const getMerkleProof = activeProvider === 'privacy-pools' ? privacyPoolsState.getMerkleProof : undefined
  const createDepositSecrets = activeProvider === 'privacy-pools' ? privacyPoolsState.createDepositSecrets : undefined
  const generateRagequitProof = activeProvider === 'privacy-pools' ? privacyPoolsState.generateRagequitProof : undefined
  const verifyWithdrawalProof = activeProvider === 'privacy-pools' ? privacyPoolsState.verifyWithdrawalProof : undefined
  const setSelectedPoolAccount = activeProvider === 'privacy-pools' ? privacyPoolsState.setSelectedPoolAccount : undefined
  const generateWithdrawalProof = activeProvider === 'privacy-pools' ? privacyPoolsState.generateWithdrawalProof : undefined
  const createWithdrawalSecrets = activeProvider === 'privacy-pools' ? privacyPoolsState.createWithdrawalSecrets : undefined

  const { account: userAccount, portfolio } = useSelectedAccountControllerState()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [ragequitLoading, setRagequitLoading] = useState<Record<string, boolean>>({})
  const [showAddedToBatch] = useState(false)

  const ethPrice = chainId
    ? portfolio.tokens
        .find((token) => token.chainId === BigInt(chainId) && token.name === 'Ether')
        ?.priceIn.find((price) => price.baseCurrency === 'usd')?.price
    : undefined

  const poolInfo = chainId ? chainData?.[chainId]?.poolInfo?.[0] : undefined

  const totalApprovedBalance = useMemo(() => {
    const accounts = poolAccounts.filter(
      (account) => account.reviewStatus === ReviewStatus.APPROVED
    )
    const total = accounts.reduce((sum, account) => sum + account.balance, 0n)
    return { total, accounts }
  }, [poolAccounts])

  const totalPendingBalance = useMemo(() => {
    const accounts = poolAccounts.filter(
      (account) =>
        account.reviewStatus === ReviewStatus.PENDING &&
        account.depositorAddress?.toLowerCase() === userAccount?.addr?.toLowerCase()
    )
    const total = accounts.reduce((sum, account) => sum + account.balance, 0n)
    return { total, accounts }
  }, [poolAccounts, userAccount?.addr])

  const totalDeclinedBalance = useMemo(() => {
    const accounts = poolAccounts.filter(
      (account) =>
        account.reviewStatus === ReviewStatus.DECLINED &&
        account.depositorAddress?.toLowerCase() === userAccount?.addr?.toLowerCase()
    )
    const total = accounts.reduce((sum, account) => sum + account.balance, 0n)
    return { total, accounts }
  }, [poolAccounts, userAccount?.addr])

  const totalPrivatePortfolio = useMemo(() => {
    // Use totalApprovedBalance from Privacy Pools
    const ethAmount = Number(formatEther(totalApprovedBalance.total))
    return ethAmount * (ethPrice || 0)
  }, [totalApprovedBalance, ethPrice])

  const ethPrivateBalance = useMemo(() => {
    return formatEther(totalApprovedBalance.total)
  }, [totalApprovedBalance])

  // Calculate batchSize based on withdrawal amount and pool accounts
  const calculatedBatchSize = useMemo(() => {
    if (!withdrawalAmount || !poolAccounts) return 1

    try {
      const approvedAccounts =
        poolAccounts?.filter((account) => account.reviewStatus === 'approved') || []

      if (approvedAccounts.length === 0) return 1

      const selectedPoolAccounts: PoolAccount[] = []
      let remainingAmount = parseUnits(withdrawalAmount, 18)

      approvedAccounts.forEach((account) => {
        if (remainingAmount > 0n) {
          selectedPoolAccounts.push(account)
          remainingAmount -= account.balance
        }
      })

      return selectedPoolAccounts.length || 1
    } catch (error) {
      // If there's an error parsing the withdrawal amount, default to 1
      return 1
    }
  }, [withdrawalAmount, poolAccounts])

  const {
    ref: estimationModalRef,
    open: openEstimationModal,
    close: closeEstimationModal
  } = useModalize()

  const handleUpdateForm = useCallback(
    (params: { [key: string]: any }) => {
      // Special handling for privacyProvider changes - reset both controllers
      if (params.privacyProvider) {
        // First update both controllers with the new provider
        dispatch({
          type: 'PRIVACY_POOLS_CONTROLLER_UPDATE_FORM',
          params: { privacyProvider: params.privacyProvider }
        })
        dispatch({
          type: 'RAILGUN_CONTROLLER_UPDATE_FORM',
          params: { privacyProvider: params.privacyProvider }
        })

        // Then reset both controllers to clear form state
        dispatch({
          type: 'PRIVACY_POOLS_CONTROLLER_RESET_FORM'
        })
        dispatch({
          type: 'RAILGUN_CONTROLLER_RESET_FORM'
        })

        // Finally update the new active controller with the provider
        const newControllerType = params.privacyProvider === 'railgun' ? 'RAILGUN_CONTROLLER_UPDATE_FORM' : 'PRIVACY_POOLS_CONTROLLER_UPDATE_FORM'
        dispatch({
          type: newControllerType,
          params: { privacyProvider: params.privacyProvider }
        })
      } else {
        // Normal form updates - determine which controller to dispatch to
        const controllerType = activeProvider === 'railgun' ? 'RAILGUN_CONTROLLER_UPDATE_FORM' : 'PRIVACY_POOLS_CONTROLLER_UPDATE_FORM'

        dispatch({
          type: controllerType,
          params: { ...params }
        })
      }

      setMessage(null)
    },
    [dispatch, activeProvider]
  )

  const prepareBatchWithdrawal = useCallback(
    (params: BatchWithdrawalParams): void => {
      dispatch({
        type: 'PRIVACY_POOLS_CONTROLLER_PREPARE_WITHDRAWAL',
        params
      })
    },
    [dispatch]
  )

  const handleSelectedAccount = (poolAccount: PoolAccount) => {
    if (!setSelectedPoolAccount) return

    setSelectedPoolAccount((prevState: any) => {
      if (prevState?.name === poolAccount.name) {
        return null
      }

      return poolAccount
    })
  }

  const openEstimationModalAndDispatch = useCallback(() => {
    dispatch({
      type: 'PRIVACY_POOLS_CONTROLLER_HAS_USER_PROCEEDED',
      params: {
        proceeded: true
      }
    })
    openEstimationModal()
  }, [openEstimationModal, dispatch])

  const syncSignAccountOp = useCallback(
    async (calls: Call[]) => {
      dispatch({
        type: 'PRIVACY_POOLS_CONTROLLER_SYNC_SIGN_ACCOUNT_OP',
        params: { calls }
      })
    },
    [dispatch]
  )

  const handleDeposit = async () => {
    if (!depositAmount || !poolInfo || !createDepositSecrets) return

    const secrets = createDepositSecrets(poolInfo.scope as Hash)

    const data = encodeFunctionData({
      abi: entrypointAbi,
      functionName: 'deposit',
      args: [secrets.precommitment]
    })

    const result = {
      to: getAddress(poolInfo.entryPointAddress),
      data,
      value: BigInt(depositAmount)
    }

    // eslint-disable-next-line no-console
    console.log('DEBUG: result', result)

    // Instead of calling handlePrivateRequest directly,
    // sync SignAccountOp with transaction data and open estimation modal
    await syncSignAccountOp([result])
    openEstimationModalAndDispatch()
  }

  const handleDepositRailgun = async () => {
    console.log('WOULD START DEPOSIT FLOW HERE.')
  }

  const isRagequitLoading = (poolAccount: PoolAccount) => {
    const accountKey = `${poolAccount.chainId}-${poolAccount.name}`
    return ragequitLoading[accountKey] || false
  }

  const handleMultipleRagequit = useCallback(async () => {
    if (!accountService || !poolInfo || !generateRagequitProof) return

    setRagequitLoading({})

    try {
      const ragequitableAccounts = [
        ...totalPendingBalance.accounts,
        ...totalDeclinedBalance.accounts
      ].filter(
        (account) =>
          !account.ragequit &&
          account.depositorAddress?.toLowerCase() === userAccount?.addr?.toLowerCase()
      )

      if (ragequitableAccounts.length === 0) {
        setMessage({ type: 'error', text: 'No accounts available to ragequit' })
        return
      }

      const proofs = await Promise.all(
        ragequitableAccounts.map(async (poolAccount) => {
          const commitment = poolAccount.lastCommitment
          const proof = await generateRagequitProof(commitment)
          return { proof, poolAccount }
        })
      )

      const txList = proofs.map(({ proof }) => {
        const transformedArgs = transformRagequitProofForContract(proof)
        const data = encodeFunctionData({
          abi: privacyPoolAbi,
          functionName: 'ragequit',
          args: [
            {
              pA: transformedArgs.pA,
              pB: transformedArgs.pB,
              pC: transformedArgs.pC,
              pubSignals: transformedArgs.pubSignals
            }
          ]
        })

        return {
          to: getAddress(poolInfo.address),
          data,
          value: 0n
        }
      })

      await syncSignAccountOp(txList)
      openEstimationModalAndDispatch()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to ragequit'
      setMessage({ type: 'error', text: errorMessage })
    }
  }, [
    accountService,
    poolInfo,
    totalPendingBalance.accounts,
    totalDeclinedBalance.accounts,
    generateRagequitProof,
    syncSignAccountOp,
    openEstimationModalAndDispatch,
    userAccount?.addr
  ])

  // Update controller with calculated batchSize whenever it changes
  // Only update when we're using privacy-pools and data is ready
  useEffect(() => {
    if (activeProvider === 'privacy-pools' && isReadyToLoad) {
      handleUpdateForm({ batchSize: calculatedBatchSize })
      console.log('DEBUG: batchSize update', calculatedBatchSize)
    }
  }, [calculatedBatchSize, handleUpdateForm, activeProvider, isReadyToLoad])

  /**
   * Handles withdrawal using multiple pool accounts via relayer API
   * This version generates proofs and submits to the relayer endpoint
   */
  const handleMultipleWithdrawal = useCallback(async () => {
    if (
      !chainId ||
      !poolInfo ||
      !mtLeaves ||
      !mtRoots ||
      !accountService ||
      !userAccount ||
      !recipientAddress ||
      !getContext ||
      !getMerkleProof ||
      !createWithdrawalSecrets ||
      !generateWithdrawalProof ||
      !verifyWithdrawalProof
    ) {
      setMessage({ type: 'error', text: 'Missing required data for withdrawal.' })
      return
    }

    const approvedAccounts =
      poolAccounts?.filter((account) => account.reviewStatus === 'approved') || []

    const selectedPoolAccounts: PoolAccount[] = []
    let remainingAmount = parseUnits(withdrawalAmount, 18)

    approvedAccounts.forEach((account) => {
      if (remainingAmount > 0n) {
        selectedPoolAccounts.push(account)
        remainingAmount -= account.balance
      }
    })

    console.log('DEBUG: recipientAddress', recipientAddress)

    const selectedPoolInfo = poolInfo

    console.log('DEBUG: RELAYER QUOTE', relayerQuote)

    const batchWithdrawal = {
      processooor: getAddress('0x7EF84c5660bB5130815099861c613BF935F4DA52'),
      data: relayerQuote?.data || '0x'
    } as Withdrawal

    const aspLeaves = mtLeaves?.aspLeaves
    const stateLeaves = mtLeaves?.stateTreeLeaves

    try {
      console.log('DEBUG: batchWithdrawal', batchWithdrawal)

      // Calculate context from the batch withdrawal data
      // IMPORTANT: All proofs MUST use the SAME context
      const context = getContext(batchWithdrawal, selectedPoolInfo.scope as Hash)

      let partialAmount = parseUnits(withdrawalAmount, 18)

      // Generate proofs for each account with the SAME context
      const proofs = await Promise.all(
        selectedPoolAccounts.map(async (poolAccount) => {
          let amount

          if (partialAmount - poolAccount.balance >= 0) {
            partialAmount -= poolAccount.balance
            amount = poolAccount.balance
          } else {
            amount = partialAmount
          }

          const commitment = poolAccount.lastCommitment

          // Generate merkle proofs
          const stateMerkleProof = getMerkleProof(
            stateLeaves?.map(BigInt) as bigint[],
            commitment.hash
          )
          const aspMerkleProof = getMerkleProof(aspLeaves?.map(BigInt), commitment.label)

          // Create withdrawal secrets
          const { secret, nullifier } = createWithdrawalSecrets(commitment)

          // Workaround for NaN index, SDK issue
          aspMerkleProof.index = Object.is(aspMerkleProof.index, NaN) ? 0 : aspMerkleProof.index

          // Prepare withdrawal proof input with the shared context
          const withdrawalProofInput = prepareWithdrawalProofInput(
            commitment,
            amount,
            stateMerkleProof,
            aspMerkleProof,
            BigInt(context),
            secret,
            nullifier
          )

          const proof = await generateWithdrawalProof(commitment, withdrawalProofInput)

          await verifyWithdrawalProof(proof)

          return proof
        })
      )
      console.log('DEBUG: calling relayer endpoint')
      const transformedProofs = proofs.map((proof) => transformProofForRelayerApi(proof))

      if (!batchWithdrawal) return

      prepareBatchWithdrawal({
        chainId,
        poolAddress: poolInfo.address,
        withdrawal: {
          processooor: batchWithdrawal.processooor,
          data: batchWithdrawal.data
        },
        proofs: transformedProofs
      })

      openEstimationModalAndDispatch()
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to process multiple withdrawal'
      setMessage({ type: 'error', text: errorMessage })
    }
  }, [
    chainId,
    mtRoots,
    mtLeaves,
    poolInfo,
    userAccount,
    poolAccounts,
    relayerQuote,
    accountService,
    withdrawalAmount,
    recipientAddress,
    getContext,
    getMerkleProof,
    verifyWithdrawalProof,
    createWithdrawalSecrets,
    generateWithdrawalProof,
    prepareBatchWithdrawal,
    openEstimationModalAndDispatch
  ])

  return {
    chainId,
    ethPrice,
    message,
    poolInfo,
    chainData,
    seedPhrase,
    poolAccounts,
    hasProceeded,
    depositAmount,
    accountService,
    withdrawalAmount,
    privacyProvider,
    showAddedToBatch,
    estimationModalRef,
    selectedPoolAccount,
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
    handleDepositRailgun,
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

export default usePrivacyPoolsForm
