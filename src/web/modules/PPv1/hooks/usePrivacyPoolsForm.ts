import { useCallback, useMemo, useState } from 'react'
import { useModalize } from 'react-native-modalize'
import {
  Address,
  createPublicClient,
  encodeFunctionData,
  formatEther,
  getAddress,
  http,
  parseUnits
} from 'viem'
import { sepolia } from 'viem/chains'
import { english, generateMnemonic } from 'viem/accounts'
import { Hash } from '@0xbow/privacy-pools-core-sdk'
import { Call } from '@ambire-common/libs/accountOp/types'
import { PoolAccount, ReviewStatus } from '@web/contexts/privacyPoolsControllerStateContext'
import useBackgroundService from '@web/hooks/useBackgroundService'
import usePrivacyPoolsControllerState from '@web/hooks/usePrivacyPoolsControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import {
  prepareWithdrawalProofInput,
  prepareMultipleWithdrawRequest,
  transformProofForContract,
  WithdrawalResult
} from '../utils/withdrawal'
import { transformRagequitProofForContract } from '../utils/ragequit'
import { entrypointAbiBatch, entrypointAbi, privacyPoolAbi } from '../utils/abi'
import { usePOC } from './usePOC'

type PrivateRequestType =
  | 'privateDepositRequest'
  | 'privateSendRequest'
  | 'privateRagequitRequest'
  | 'privateWithdrawRequest'

const usePrivacyPoolsForm = () => {
  const { dispatch } = useBackgroundService()
  const {
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
    isAccountLoaded,
    recipientAddress,
    getContext,
    loadAccount,
    getMerkleProof,
    createDepositSecrets,
    generateRagequitProof,
    verifyWithdrawalProof,
    setSelectedPoolAccount,
    generateWithdrawalProof,
    createWithdrawalSecrets
  } = usePrivacyPoolsControllerState()
  const { getData, storeData, decrypt, encrypt } = usePOC()

  const { account: userAccount, portfolio } = useSelectedAccountControllerState()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoadingSeedPhrase, setIsLoadingSeedPhrase] = useState(false)
  const [isLoadingAccount, setIsLoadingAccount] = useState(false)
  const [ragequitLoading, setRagequitLoading] = useState<Record<string, boolean>>({})
  const [showAddedToBatch] = useState(false)

  const ethPrice = portfolio.tokens
    .find((token) => token.chainId === 11155111n && token.name === 'Ether')
    ?.priceIn.find((price) => price.baseCurrency === 'usd')?.price

  const poolInfo = chainData?.[11155111]?.poolInfo?.[0]

  const totalApprovedBalance = useMemo(() => {
    const accounts = poolAccounts.filter(
      (account) => account.reviewStatus === ReviewStatus.APPROVED
    )
    const total = accounts.reduce((sum, account) => sum + account.balance, 0n)
    return { total, accounts }
  }, [poolAccounts])

  const totalPendingBalance = useMemo(() => {
    const accounts = poolAccounts.filter((account) => account.reviewStatus === ReviewStatus.PENDING)
    const total = accounts.reduce((sum, account) => sum + account.balance, 0n)
    return { total, accounts }
  }, [poolAccounts])

  const totalDeclinedBalance = useMemo(() => {
    const accounts = poolAccounts.filter(
      (account) => account.reviewStatus === ReviewStatus.DECLINED
    )
    const total = accounts.reduce((sum, account) => sum + account.balance, 0n)
    return { total, accounts }
  }, [poolAccounts])

  const totalPrivatePortfolio = useMemo(() => {
    // Use totalApprovedBalance from Privacy Pools
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
        type: 'PRIVACY_POOLS_CONTROLLER_UPDATE_FORM',
        params: { ...params }
      })

      setMessage(null)
    },
    [dispatch]
  )

  const handlePrivateRequest = (
    type: PrivateRequestType,
    txList: { to: string; value: bigint; data: string }[]
  ) => {
    dispatch({
      type: 'REQUESTS_CONTROLLER_BUILD_REQUEST',
      params: { type, params: { txList, actionExecutionType: 'open-action-window' } }
    })
  }

  const handleGenerateSeedPhrase = async () => {
    setIsGenerating(true)
    setMessage(null)

    const newSeedPhrase = generateMnemonic(english)
    handleUpdateForm({ seedPhrase: newSeedPhrase })
    setMessage({ type: 'success', text: 'New seed phrase generated successfully!' })
    setIsGenerating(false)
  }

  const handleLoadAccount = useCallback(async () => {
    if (!seedPhrase?.trim()) {
      setMessage({ type: 'error', text: 'Please enter a seed phrase to load an existing account.' })
      return
    }
    try {
      setMessage(null)
      setIsLoadingAccount(true)

      await loadAccount()
      setMessage({ type: 'success', text: 'Account loaded successfully!' })
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to load account. Please try again.'
      setMessage({ type: 'error', text: errorMessage })
    }
    setIsLoadingAccount(false)
    if (seedPhrase) {
      const encrypted = await encrypt(seedPhrase)
      await storeData(encrypted)
    }
  }, [seedPhrase, loadAccount, encrypt, storeData])

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

    // eslint-disable-next-line no-console
    console.log('DEBUG: result', result)

    // Instead of calling handlePrivateRequest directly,
    // sync SignAccountOp with transaction data and open estimation modal
    await syncSignAccountOp([result])
    openEstimationModalAndDispatch()
  }

  const isRagequitLoading = (poolAccount: PoolAccount) => {
    const accountKey = `${poolAccount.chainId}-${poolAccount.name}`
    return ragequitLoading[accountKey] || false
  }

  const handleRagequit = async (poolAccount: PoolAccount, event: any) => {
    // Prevent the click from bubbling up to the parent AccountCard
    event.stopPropagation()
    const accountKey = `${poolAccount.chainId}-${poolAccount.name}`
    setRagequitLoading((prev) => ({ ...prev, [accountKey]: true }))

    if (!accountService || !poolInfo) return

    const commitment = poolAccount.lastCommitment

    // Generate ragequit proof using the last commitment (current balance)
    const proof = await generateRagequitProof(commitment)

    // Transform proof for contract interaction
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

    const result = {
      to: getAddress(poolInfo.address),
      data,
      value: 0n
    }

    handlePrivateRequest('privateRagequitRequest', [result])
    setRagequitLoading((prev) => ({ ...prev, [accountKey]: false }))
  }

  const handleMultipleRagequit = useCallback(async () => {
    if (!accountService || !poolInfo) return

    setRagequitLoading({})

    try {
      const ragequitableAccounts = [
        ...totalPendingBalance.accounts,
        ...totalDeclinedBalance.accounts
      ].filter((account) => !account.ragequit)

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
    openEstimationModalAndDispatch
  ])

  /**
   * Generates withdrawal proof and prepares transaction data
   */
  // const generateWithdrawalData = async ({
  //   commitment,
  //   amount,
  //   decimals,
  //   target,
  //   relayerAddress,
  //   feeBPSForWithdraw,
  //   poolScope,
  //   stateLeaves,
  //   aspLeaves,
  //   entrypointAddress
  // }: Omit<WithdrawalParams, 'poolAddress'>): Promise<{
  //   withdrawal: Withdrawal
  //   proof: WithdrawalProof
  //   formattedProofs: ReturnType<typeof transformProofForContract>
  //   error?: string
  // }> => {
  //   try {
  //     // Prepare withdrawal request
  //     const withdrawal = prepareWithdrawRequest(
  //       getAddress(target),
  //       getAddress(entrypointAddress),
  //       getAddress(relayerAddress),
  //       feeBPSForWithdraw.toString()
  //     )
  //     // Generate merkle proofs
  //     const stateMerkleProof = getMerkleProof(stateLeaves?.map(BigInt) as bigint[], commitment.hash)
  //     const aspMerkleProof = getMerkleProof(aspLeaves?.map(BigInt), commitment.label)
  //     // Calculate context
  //     const context = getContext(withdrawal, poolScope)
  //     // Create withdrawal secrets
  //     const { secret, nullifier } = createWithdrawalSecrets(commitment)
  //     // Workaround for NaN index, SDK issue
  //     aspMerkleProof.index = Object.is(aspMerkleProof.index, NaN) ? 0 : aspMerkleProof.index
  //     // Prepare withdrawal proof input
  //     const withdrawalProofInput = prepareWithdrawalProofInput(
  //       commitment,
  //       parseUnits(amount, decimals),
  //       stateMerkleProof,
  //       aspMerkleProof,
  //       BigInt(context),
  //       secret,
  //       nullifier
  //     )
  //     // Generate withdrawal proof
  //     const proof = await generateWithdrawalProof(commitment, withdrawalProofInput)
  //     // Verify the proof
  //     await verifyWithdrawalProof(proof)
  //     // Transform proof for contract interaction
  //     const formattedProofs = transformProofForContract(proof)
  //
  //     return {
  //       withdrawal,
  //       proof /* No es necesario devolver proofs */,
  //       formattedProofs /* Esto debería ser una lista */
  //     }
  //   } catch (error) {
  //     const errorMessage =
  //       error instanceof Error ? error.message : 'Failed to generate withdrawal data'
  //     return {
  //       withdrawal: {} as Withdrawal,
  //       proof: {} as WithdrawalProof,
  //       formattedProofs: {} as ReturnType<typeof transformProofForContract>,
  //       error: errorMessage
  //     }
  //   }
  // }

  const loadSeedPhrase = useCallback(async () => {
    const data = await getData()
    if (data) {
      setIsLoadingSeedPhrase(true)
      const decrypted = await decrypt(data)
      handleUpdateForm({ seedPhrase: decrypted || '' })
      setIsLoadingSeedPhrase(false)
    }
  }, [getData, decrypt, handleUpdateForm])

  const isLoading = isLoadingSeedPhrase || isLoadingAccount

  // const executeWithdrawalTransaction = async ({
  //   commitment,
  //   amount,
  //   decimals,
  //   target,
  //   relayerAddress,
  //   feeBPSForWithdraw,
  //   poolScope,
  //   stateLeaves,
  //   aspLeaves,
  //   userAddress,
  //   entrypointAddress
  // }: WithdrawalParams): Promise<WithdrawalResult> => {
  //   const { withdrawal, proof, formattedProofs, error } = await generateWithdrawalData({
  //     commitment,
  //     amount,
  //     decimals,
  //     target,
  //     relayerAddress,
  //     feeBPSForWithdraw,
  //     poolScope,
  //     stateLeaves,
  //     aspLeaves,
  //     userAddress,
  //     entrypointAddress
  //   })
  //
  //   if (error || !withdrawal || !proof || !formattedProofs) {
  //     return {
  //       to: getAddress(entrypointAddress),
  //       data: '0x',
  //       value: 0n
  //     }
  //   }
  //
  //   const result = encodeFunctionData({
  //     abi: entrypointAbiBatch,
  //     functionName: 'batchRelay',
  //     args: [
  //       '0x644d5A2554d36e27509254F32ccfeBe8cd58861f', // Address de la poolInfo
  //       {
  //         processooor:
  //           /* getAddress(entrypointAddress) */ '0x7EF84c5660bB5130815099861c613BF935F4DA52',
  //         data: withdrawal.data
  //       },
  //       [
  //         // Array de proofs (transformedArgs)
  //         {
  //           pA: formattedProofs.pA,
  //           pB: formattedProofs.pB,
  //           pC: formattedProofs.pC,
  //           pubSignals: formattedProofs.pubSignals
  //         }
  //       ]
  //
  //       // poolScope // NO VA MAS
  //     ]
  //   })
  //
  //   return {
  //     to: getAddress(entrypointAddress),
  //     data: result,
  //     value: 0n
  //   }
  // }

  // const handleWithdrawal = async (/* poolAccount: PoolAccount, targetAddress: string */) => {
  //   // TODO: fix this later, just a mock
  //   const poolAccount = poolAccounts?.find((account) => account.reviewStatus === 'approved')
  //
  //   if (!poolAccount) return
  //
  //   const targetAddress = recipientAddress
  //
  //   const { error, isValid } = validateWithdrawal(poolAccount, withdrawalAmount, targetAddress)
  //
  //   if (
  //     !isValid ||
  //     !poolInfo ||
  //     !mtLeaves ||
  //     !mtRoots ||
  //     !accountService ||
  //     !targetAddress ||
  //     !withdrawalAmount ||
  //     !userAccount
  //   ) {
  //     setMessage(error)
  //     return
  //   }
  //
  //   const target = getAddress(targetAddress)
  //   const selectedPoolInfo = poolInfo
  //   const relayerAddress = userAccount.addr as Address
  //   const decimals = selectedPoolInfo?.assetDecimals || 18
  //   const feeBPSForWithdraw = 0
  //
  //   const aspLeaves = mtLeaves?.aspLeaves
  //   const stateLeaves = mtLeaves?.stateTreeLeaves
  //   const commitment = poolAccount.lastCommitment
  //
  //   const withdrawalParams: WithdrawalParams = {
  //     commitment,
  //     amount: withdrawalAmount,
  //     decimals,
  //     target,
  //     relayerAddress,
  //     feeBPSForWithdraw,
  //     poolScope: selectedPoolInfo.scope as Hash,
  //     stateLeaves,
  //     aspLeaves,
  //     userAddress: userAccount.addr as Address,
  //     entrypointAddress: poolInfo.entryPointAddress
  //   }
  //
  //   const result = await executeWithdrawalTransaction(withdrawalParams) // Esto debería ser un array de withdrawalParams
  //
  //   await syncSignAccountOp([result])
  //   openEstimationModalAndDispatch()
  // }

  /**
   * Handles withdrawal using multiple pool accounts
   * This version selects at least 2 pool accounts and generates params and proofs for each
   */
  const handleMultipleWithdrawal = async () => {
    const targetAddress = recipientAddress

    if (!poolInfo || !mtLeaves || !mtRoots || !accountService || !userAccount || !targetAddress) {
      setMessage({ type: 'error', text: 'Missing required data for withdrawal.' })
      return
    }

    // Select at least 2 approved pool accounts for testing
    const approvedAccounts =
      poolAccounts?.filter((account) => account.reviewStatus === 'approved') || []

    if (approvedAccounts.length < 2) {
      setMessage({
        type: 'error',
        text: 'Need at least 2 approved pool accounts for multiple withdrawal.'
      })
      return
    }

    // For now, just take the first 2 accounts
    const selectedPoolAccounts = approvedAccounts.slice(0, 2)

    const target = getAddress(targetAddress)
    const selectedPoolInfo = poolInfo
    const relayerAddress = userAccount.addr as Address
    const feeBPSForWithdraw = 0

    const aspLeaves = mtLeaves?.aspLeaves
    const stateLeaves = mtLeaves?.stateTreeLeaves

    try {
      // Calculate total value from all account balances
      // const totalValue = selectedPoolAccounts.reduce((sum, poolAccount) => {
      //   return sum + poolAccount.balance
      // }, 0n)

      // IMPORTANT: Prepare batch withdrawal request FIRST (before generating proofs)
      // This ensures all proofs use the SAME context from the BatchRelayData

      // Prepare the batch withdrawal request with batchSize and totalValue
      const batchWithdrawal = prepareMultipleWithdrawRequest(
        target,
        getAddress('0x7EF84c5660bB5130815099861c613BF935F4DA52'), // processooor should be BatchRelayer for batch withdrawals
        relayerAddress,
        feeBPSForWithdraw.toString(),
        selectedPoolAccounts.length,
        parseUnits(withdrawalAmount, 18) // TODO: Check if this is working
      )

      console.log('DEBUG: batchWithdrawal', batchWithdrawal)

      // Calculate context from the batch withdrawal data
      // IMPORTANT: All proofs MUST use the SAME context
      const context = getContext(batchWithdrawal, selectedPoolInfo.scope as Hash)

      console.log('DEBUG: Shared context for all proofs:', context)

      // Generate proofs for each account with the SAME context
      const proofs = await Promise.all(
        selectedPoolAccounts.map(async (poolAccount) => {
          const commitment = poolAccount.lastCommitment
          const amount = poolAccount.balance

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

          // Generate withdrawal proof
          const proof = await generateWithdrawalProof(commitment, withdrawalProofInput)

          // Verify the proof
          await verifyWithdrawalProof(proof)

          return proof
        })
      )

      console.log('DEBUG: Generated', proofs.length, 'proofs with shared context')

      // Transform all proofs for contract interaction
      const transformedProofs = proofs.map((proof) => transformProofForContract(proof))

      console.log('DEBUG: transformedProofs', transformedProofs)

      // Create a public client for simulation
      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http()
      })

      // Simulate the contract call to catch errors before sending
      try {
        const { request } = await publicClient.simulateContract({
          address: '0x7EF84c5660bB5130815099861c613BF935F4DA52', // BatchRelayer contract
          abi: entrypointAbiBatch,
          functionName: 'batchRelay',
          args: [
            getAddress(poolInfo.address),
            batchWithdrawal,
            transformedProofs.map((proof) => ({
              pA: proof.pA,
              pB: proof.pB,
              pC: proof.pC,
              pubSignals: proof.pubSignals
            }))
          ],
          account: userAccount.addr as Address
        })

        console.log('DEBUG: Multiple withdrawal simulation successful', request)
      } catch (simulationError) {
        console.error('DEBUG: Multiple withdrawal simulation failed', simulationError)
        const errorMsg =
          simulationError instanceof Error ? simulationError.message : 'Simulation failed'
        setMessage({ type: 'error', text: `Contract simulation failed: ${errorMsg}` })
        return
      }

      // Build the batch transaction data
      const batchTransactionData = encodeFunctionData({
        abi: entrypointAbiBatch,
        functionName: 'batchRelay',
        args: [
          getAddress(poolInfo.address),
          batchWithdrawal,
          transformedProofs.map((proof) => ({
            pA: proof.pA,
            pB: proof.pB,
            pC: proof.pC,
            pubSignals: proof.pubSignals
          }))
        ]
      })

      console.log('DEBUG: batchTransactionData', batchTransactionData)

      const result: WithdrawalResult = {
        to: getAddress('0x7EF84c5660bB5130815099861c613BF935F4DA52'), // BatchRelayer contract
        data: batchTransactionData,
        value: 0n
      }

      await syncSignAccountOp([result])
      openEstimationModalAndDispatch()
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to process multiple withdrawal'
      setMessage({ type: 'error', text: errorMessage })
    }
  }

  return {
    ethPrice,
    message,
    poolInfo,
    chainData,
    seedPhrase,
    poolAccounts,
    hasProceeded,
    isGenerating,
    depositAmount,
    accountService,
    withdrawalAmount,
    isLoadingAccount,
    showAddedToBatch,
    estimationModalRef,
    selectedPoolAccount,
    signAccountOpController,
    latestBroadcastedAccountOp,
    isLoading,
    isAccountLoaded,
    totalApprovedBalance,
    totalPendingBalance,
    totalDeclinedBalance,
    totalPrivatePortfolio,
    ethPrivateBalance,
    handleDeposit,
    handleRagequit,
    handleMultipleRagequit,
    handleMultipleWithdrawal,
    handleUpdateForm,
    handleLoadAccount,
    isRagequitLoading,
    closeEstimationModal,
    handleSelectedAccount,
    handleGenerateSeedPhrase,
    loadSeedPhrase
  }
}

export default usePrivacyPoolsForm
