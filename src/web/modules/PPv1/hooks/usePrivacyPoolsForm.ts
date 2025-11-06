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
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import { prepareWithdrawalProofInput, transformProofForRelayerApi } from '../utils/withdrawal'
import { transformRagequitProofForContract } from '../utils/ragequit'
import { entrypointAbi, privacyPoolAbi } from '../utils/abi'
import {
  convertToAlgorithmFormat,
  generateAnonymitySetFromChain
} from '../sdk/noteSelection/anonimitySet/anonymitySetGeneration'
import { selectNotesForWithdrawal } from '../sdk/noteSelection/selectNotesForWithdrawal'
import { getPoolAccountsFromResult } from '../sdk/noteSelection/helpers'

const usePrivacyPoolsForm = () => {
  const { dispatch } = useBackgroundService()
  const {
    chainId,
    mtRoots,
    mtLeaves,
    chainData,
    seedPhrase,
    poolAccounts,
    hasProceeded,
    depositAmount,
    accountService,
    withdrawalAmount,
    selectedPoolAccount,
    signAccountOpController,
    latestBroadcastedAccountOp,
    importedPrivateAccounts,
    importedAccountsWithNames,
    isAccountLoaded,
    isLoadingAccount,
    isRefreshing,
    isReadyToLoad,
    recipientAddress,
    relayerQuote,
    validationFormMsgs,
    proofsBatchSize,
    getContext,
    loadPrivateAccount,
    refreshPrivateAccount,
    getMerkleProof,
    createDepositSecrets,
    generateRagequitProof,
    verifyWithdrawalProof,
    setSelectedPoolAccount,
    generateWithdrawalProof,
    createWithdrawalSecrets
  } = usePrivacyPoolsControllerState()

  const { account: userAccount, portfolio } = useSelectedAccountControllerState()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [ragequitLoading, setRagequitLoading] = useState<Record<string, boolean>>({})
  const [showAddedToBatch] = useState(false)

  const allPA = useMemo(() => {
    return [...poolAccounts, ...importedPrivateAccounts.flat()]
  }, [poolAccounts, importedPrivateAccounts])

  const ethPrice = portfolio.tokens
    .find((token) => token.chainId === BigInt(chainId) && token.name === 'Ether')
    ?.priceIn.find((price) => price.baseCurrency === 'usd')?.price

  const poolInfo = chainData?.[chainId]?.poolInfo?.[0]

  const totalApprovedBalance = useMemo(() => {
    const accounts = allPA.filter((account) => account.reviewStatus === ReviewStatus.APPROVED)
    const total = accounts.reduce((sum, account) => sum + account.balance, 0n)
    return { total, accounts }
  }, [allPA])

  const totalPendingBalance = useMemo(() => {
    const accounts = allPA.filter((account) => account.reviewStatus === ReviewStatus.PENDING)
    const total = accounts.reduce((sum, account) => sum + account.balance, 0n)
    return { total, accounts }
  }, [allPA])

  const totalDeclinedBalance = useMemo(() => {
    const accounts = allPA.filter(
      (account) =>
        account.reviewStatus === ReviewStatus.DECLINED &&
        account.depositorAddress?.toLowerCase() === userAccount?.addr?.toLowerCase()
    )
    const total = accounts.reduce((sum, account) => sum + account.balance, 0n)
    return { total, accounts }
  }, [allPA, userAccount?.addr])

  const totalPrivatePortfolio = useMemo(() => {
    // Use totalApprovedBalance from Privacy Pools
    const ethAmount = Number(formatEther(totalApprovedBalance.total))
    return ethAmount * (ethPrice || 0)
  }, [totalApprovedBalance, ethPrice])

  const ethPrivateBalance = useMemo(() => {
    return formatEther(totalApprovedBalance.total)
  }, [totalApprovedBalance])

  // Imported Private Accounts calculations
  const flattenedImportedAccounts = useMemo(() => {
    return importedPrivateAccounts.flat()
  }, [importedPrivateAccounts])

  const totalImportedApprovedBalance = useMemo(() => {
    const accounts = flattenedImportedAccounts.filter(
      (account) => account.reviewStatus === ReviewStatus.APPROVED
    )
    const total = accounts.reduce((sum, account) => sum + account.balance, 0n)
    return { total, accounts }
  }, [flattenedImportedAccounts])

  const totalImportedPendingBalance = useMemo(() => {
    const accounts = flattenedImportedAccounts.filter(
      (account) => account.reviewStatus === ReviewStatus.PENDING
    )
    const total = accounts.reduce((sum, account) => sum + account.balance, 0n)
    return { total, accounts }
  }, [flattenedImportedAccounts])

  const totalImportedDeclinedBalance = useMemo(() => {
    const accounts = flattenedImportedAccounts.filter(
      (account) => account.reviewStatus === ReviewStatus.DECLINED
    )
    const total = accounts.reduce((sum, account) => sum + account.balance, 0n)
    return { total, accounts }
  }, [flattenedImportedAccounts])

  const totalImportedPrivatePortfolio = useMemo(() => {
    const ethAmount = Number(formatEther(totalImportedApprovedBalance.total))
    return ethAmount * (ethPrice || 0)
  }, [totalImportedApprovedBalance, ethPrice])

  const ethImportedPrivateBalance = useMemo(() => {
    return formatEther(totalImportedApprovedBalance.total)
  }, [totalImportedApprovedBalance])

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
      dispatch({
        type: 'PRIVACY_POOLS_CONTROLLER_UPDATE_FORM',
        params: { ...params }
      })

      setMessage(null)
    },
    [dispatch]
  )

  const directBroadcastWithdrawal = useCallback(
    async (params: BatchWithdrawalParams): Promise<void> => {
      dispatch({
        type: 'PRIVACY_POOLS_CONTROLLER_DIRECT_BROADCAST_WITHDRAWAL',
        params
      })
    },
    [dispatch]
  )

  const handleSelectedAccount = (poolAccount: PoolAccount) => {
    setSelectedPoolAccount((prevState) => {
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
    if (!depositAmount || !poolInfo) return

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

    await syncSignAccountOp([result])
    openEstimationModalAndDispatch()
  }

  const isRagequitLoading = (poolAccount: PoolAccount) => {
    const accountKey = `${poolAccount.chainId}-${poolAccount.name}`
    return ragequitLoading[accountKey] || false
  }

  const handleMultipleRagequit = useCallback(async () => {
    if (!accountService || !poolInfo) return

    setRagequitLoading({})

    try {
      const ragequitableAccounts = [
        // ...totalPendingBalance.accounts,
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
    // totalPendingBalance.accounts,
    totalDeclinedBalance.accounts,
    generateRagequitProof,
    syncSignAccountOp,
    openEstimationModalAndDispatch,
    userAccount?.addr
  ])

  const runNoteSelection = useCallback(async () => {
    try {
      const anonymitySetData = await generateAnonymitySetFromChain()
      const convertedData = convertToAlgorithmFormat(anonymitySetData)

      const algorithmResults = selectNotesForWithdrawal({
        poolAccounts,
        importedPoolAccounts: importedPrivateAccounts.flat(),
        withdrawalAmount: Number(withdrawalAmount),
        anonymityData: convertedData
      })
      console.log({ algorithmResults })

      console.log('📊 Algorithm Results:')
      console.log(`   Generated ${algorithmResults.length} candidate strategies`)
      algorithmResults.forEach((result, index) => {
        console.log(
          `   ${index + 1}. ${result.name} - Privacy Score: ${result.privacyScore.toFixed(4)} ${
            result.isChosen ? '🏆 WINNER' : ''
          }`
        )
      })

      const poolAccountsFromResult = getPoolAccountsFromResult(algorithmResults[0])

      return poolAccountsFromResult
    } catch (error) {
      console.error('Error running note selection:', error)
      return []
    }
  }, [poolAccounts, importedPrivateAccounts, withdrawalAmount])

  const handleMultipleWithdrawal = useCallback(async () => {
    if (
      !poolInfo ||
      !mtLeaves ||
      !mtRoots ||
      !accountService ||
      !userAccount ||
      !recipientAddress
    ) {
      throw new Error('Missing required data for withdrawal.')
    }

    const selectedPoolInfo = poolInfo

    const batchWithdrawal = {
      processooor: getAddress('0x7EF84c5660bB5130815099861c613BF935F4DA52'),
      data: relayerQuote?.data || '0x'
    } as Withdrawal

    const aspLeaves = mtLeaves?.aspLeaves
    const stateLeaves = mtLeaves?.stateTreeLeaves

    // IMPORTANT: All proofs MUST use the SAME context
    const context = getContext(batchWithdrawal, selectedPoolInfo.scope as Hash)

    const accountsWithAmounts = await runNoteSelection()

    // Generate proofs for each account with the SAME context
    // Using batched sequential processing to prevent memory issues
    // TEMPORARY: Set BATCH_SIZE to total number of proofs for testing
    const BATCH_SIZE = proofsBatchSize
    const GC_DELAY = 150 // 150ms delay between batches for garbage collection

    const proofs: Awaited<ReturnType<typeof generateWithdrawalProof>>[] = []
    const errors: Array<{ index: number; error: any }> = []

    // eslint-disable-next-line no-await-in-loop
    for (let i = 0; i < accountsWithAmounts.length; i += BATCH_SIZE) {
      const batch = accountsWithAmounts.slice(i, i + BATCH_SIZE)

      // eslint-disable-next-line no-await-in-loop
      const batchResults = await Promise.allSettled(
        batch.map(async ({ poolAccount, amount }) => {
          const commitment = poolAccount.lastCommitment

          const stateMerkleProof = getMerkleProof(
            stateLeaves?.map(BigInt) as bigint[],
            commitment.hash
          )
          const aspMerkleProof = getMerkleProof(aspLeaves?.map(BigInt), commitment.label)

          const { secret, nullifier } = createWithdrawalSecrets(commitment)

          // Workaround for NaN index, SDK issue
          aspMerkleProof.index = Object.is(aspMerkleProof.index, NaN) ? 0 : aspMerkleProof.index

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

      // Process batch results
      batchResults.forEach((result, batchIndex) => {
        const globalIndex = i + batchIndex
        if (result.status === 'fulfilled') {
          proofs.push(result.value)
        } else {
          errors.push({ index: globalIndex, error: result.reason })
        }
      })

      // Add delay between batches for garbage collection (except after the last batch)
      if (i + BATCH_SIZE < accountsWithAmounts.length) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise<void>((resolve) => {
          setTimeout(resolve, GC_DELAY)
        })
      }
    }

    // Check for failures
    if (errors.length > 0) {
      const errorMessages = errors
        .map(({ index, error }) => `Account ${index + 1}: ${error}`)
        .join('; ')

      throw new Error(
        `Failed to generate ${errors.length} proof(s) out of ${accountsWithAmounts.length}: ${errorMessages}`
      )
    }

    const transformedProofs = proofs.map((proof) => transformProofForRelayerApi(proof))

    if (!batchWithdrawal) return

    await directBroadcastWithdrawal({
      chainId,
      poolAddress: poolInfo.address,
      withdrawal: {
        processooor: batchWithdrawal.processooor,
        data: batchWithdrawal.data
      },
      proofs: transformedProofs
    })
  }, [
    poolInfo,
    mtLeaves,
    mtRoots,
    accountService,
    userAccount,
    recipientAddress,
    relayerQuote?.data,
    getContext,
    runNoteSelection,
    proofsBatchSize,
    directBroadcastWithdrawal,
    chainId,
    getMerkleProof,
    createWithdrawalSecrets,
    generateWithdrawalProof,
    verifyWithdrawalProof
  ])

  useEffect(() => {
    handleUpdateForm({ batchSize: calculatedBatchSize })
  }, [calculatedBatchSize, handleUpdateForm])

  // Update currentPrivateBalance whenever totalApprovedBalance changes
  useEffect(() => {
    const balanceString = formatEther(totalApprovedBalance.total)
    handleUpdateForm({ currentPrivateBalance: balanceString })
  }, [totalApprovedBalance.total, handleUpdateForm])

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
    totalImportedApprovedBalance,
    totalImportedPendingBalance,
    totalImportedDeclinedBalance,
    totalImportedPrivatePortfolio,
    ethImportedPrivateBalance,
    importedAccountsWithNames,
    validationFormMsgs,
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

export default usePrivacyPoolsForm
