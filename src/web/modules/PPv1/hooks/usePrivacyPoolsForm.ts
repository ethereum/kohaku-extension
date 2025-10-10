import { useCallback, useMemo, useState } from 'react'
import { useModalize } from 'react-native-modalize'
import { Address, encodeFunctionData, formatEther, getAddress, parseUnits } from 'viem'
import { english, generateMnemonic } from 'viem/accounts'
import { Hash, type Withdrawal } from '@0xbow/privacy-pools-core-sdk'
import { Call } from '@ambire-common/libs/accountOp/types'
import { PoolAccount, ReviewStatus } from '@web/contexts/privacyPoolsControllerStateContext'
import useBackgroundService from '@web/hooks/useBackgroundService'
import usePrivacyPoolsControllerState from '@web/hooks/usePrivacyPoolsControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import {
  prepareWithdrawalProofInput,
  prepareMultipleWithdrawRequest,
  transformProofForContract,
  transformProofForRelayerApi,
  WithdrawalResult
} from '../utils/withdrawal'
import { transformRagequitProofForContract } from '../utils/ragequit'
import { entrypointAbiBatch, entrypointAbi, privacyPoolAbi } from '../utils/abi'
import { usePOC } from './usePOC'
import {
  BatchWithdrawalParams,
  BatchWithdrawalProof
} from '@ambire-common/controllers/privacyPools/privacyPools'

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

  // const submitBatchWithdrawal = useCallback(
  //   (params: BatchWithdrawalParams): void => {
  //     // Dispatch action to background service (fire-and-forget pattern)
  //     // The controller will update its state and UI will receive updates via context
  //     dispatch({
  //       type: 'PRIVACY_POOLS_CONTROLLER_SUBMIT_BATCH_WITHDRAWAL',
  //       params
  //     })
  //   },
  //   [dispatch]
  // )

  const handleGenerateSeedPhrase = async () => {
    setIsGenerating(true)
    setMessage(null)

    const newSeedPhrase = generateMnemonic(english)
    handleUpdateForm({ seedPhrase: newSeedPhrase })
    setMessage({ type: 'success', text: 'New seed phrase generated successfully!' })
    setIsGenerating(false)
  }

  const handleLoadAccount = useCallback(
    async (seedPhraseToLoad?: string) => {
      if (!seedPhraseToLoad?.trim()) {
        setMessage({
          type: 'error',
          text: 'Please enter a seed phrase to load an existing account.'
        })
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
    },
    [seedPhrase, loadAccount, encrypt, storeData]
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

  const loadSeedPhrase = useCallback(async () => {
    const data = await getData()
    if (data) {
      setIsLoadingSeedPhrase(true)
      const decrypted = await decrypt(data)
      await handleLoadAccount(decrypted)
      handleUpdateForm({ seedPhrase: decrypted || '' })
      setIsLoadingSeedPhrase(false)
    }
  }, [getData, decrypt, handleUpdateForm, handleLoadAccount])

  const isLoading = isLoadingSeedPhrase || isLoadingAccount

  /**
   * Handles withdrawal using multiple pool accounts via relayer API
   * This version generates proofs and submits to the relayer endpoint
   */
  const handleMultipleWithdrawal = async () => {
    if (
      !poolInfo ||
      !mtLeaves ||
      !mtRoots ||
      !accountService ||
      !userAccount ||
      !recipientAddress
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

    const isRelayer = true // Change this to test the contract or the endpoint
    const relayerUrl = 'https://relayer-staging-149184580131.us-east1.run.app'

    console.log('DEBUG: recipientAddress', recipientAddress)

    const target = getAddress(recipientAddress)
    const selectedPoolInfo = poolInfo

    let feeRecipient = userAccount.addr as Address
    let feeBPSForWithdraw = 0
    let totalAmountWithFee = withdrawalAmount

    let batchWithdrawal

    if (isRelayer) {
      // Fetch relayer details to get the fee recipient address
      const detailsResponse = await fetch(
        `${relayerUrl}/relayer/details?chainId=${selectedPoolInfo.chainId}&assetAddress=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE`
      )

      const relayerDetails = await detailsResponse.json()
      feeRecipient = getAddress(relayerDetails.feeReceiverAddress)

      console.log('DEBUG: relayer details', relayerDetails, 'feeRecipient', feeRecipient)

      // Fetch quote to get the relay fee
      const quoteResonse = await fetch(`${relayerUrl}/relayer/batch/quote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(
          {
            chainId: selectedPoolInfo.chainId,
            batchSize: selectedPoolAccounts.length,
            totalAmount: parseUnits(withdrawalAmount, 18),
            recipient: target
          },
          (_, value) => (typeof value === 'bigint' ? value.toString() : value)
        )
      })

      const quote = await quoteResonse.json()

      feeBPSForWithdraw = quote.relayFeeBPS

      totalAmountWithFee = (
        parseFloat(withdrawalAmount) *
        (1 + feeBPSForWithdraw / 10000)
      ).toString()

      batchWithdrawal = {
        processooor: getAddress('0x7EF84c5660bB5130815099861c613BF935F4DA52'),
        data: quote.batchFeeCommitment.batchRelayData
      } as Withdrawal

      console.log('DEBUG: quote', quote, 'feeBPSForWithdraw', feeBPSForWithdraw, totalAmountWithFee)
    }

    const aspLeaves = mtLeaves?.aspLeaves
    const stateLeaves = mtLeaves?.stateTreeLeaves

    try {
      // IMPORTANT: Prepare batch withdrawal request FIRST (before generating proofs)
      // This ensures all proofs use the SAME context from the BatchRelayData

      if (!isRelayer) {
        // Prepare the batch withdrawal request with batchSize and totalValue
        batchWithdrawal = prepareMultipleWithdrawRequest(
          target,
          getAddress('0x7EF84c5660bB5130815099861c613BF935F4DA52'), // processooor should be BatchRelayer for batch withdrawals
          feeRecipient,
          feeBPSForWithdraw.toString(), // Fee in basis points (e.g., 101 = 1.01%)
          selectedPoolAccounts.length,
          parseUnits(totalAmountWithFee, 18)
        )
      }

      console.log('DEBUG: batchWithdrawal', batchWithdrawal)

      // Calculate context from the batch withdrawal data
      // IMPORTANT: All proofs MUST use the SAME context
      const context = getContext(batchWithdrawal!, selectedPoolInfo.scope as Hash)

      let partialAmount = parseUnits(totalAmountWithFee, 18)

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

          // Generate withdrawal proof
          const proof = await generateWithdrawalProof(commitment, withdrawalProofInput)

          // Verify the proof
          await verifyWithdrawalProof(proof)

          return proof
        })
      )

      if (!isRelayer) {
        console.log('DEBUG: calling contract')
        const transformedProofs = proofs.map((proof) => transformProofForContract(proof))
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

        const result: WithdrawalResult = {
          to: getAddress('0x7EF84c5660bB5130815099861c613BF935F4DA52'), // BatchRelayer contract
          data: batchTransactionData,
          value: 0n
        }

        await syncSignAccountOp([result])
        openEstimationModalAndDispatch()
      } else {
        console.log('DEBUG: calling relayer endpoint')
        const transformedProofs = proofs.map((proof) => transformProofForRelayerApi(proof))

        // submitBatchWithdrawal({
        //          chainId: 11155111,
        //          poolAddress: poolInfo.address,
        //          withdrawal: {
        //            processooor: batchWithdrawal.processooor,
        //            data: batchWithdrawal.data
        //          },
        //          proofs: transformedProofs
        //        })

        // Direct relayer API call for testing

        const params = {
          chainId: 11155111,
          poolAddress: poolInfo.address,
          withdrawal: {
            processooor: batchWithdrawal.processooor,
            data: batchWithdrawal.data
          },
          proofs: transformedProofs
        }

        console.log('DEBUG: Direct relayer call with params:', params)

        try {
          const response = await fetch(`${relayerUrl}/relayer/batch/request`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(params, (_, value) =>
              typeof value === 'bigint' ? value.toString() : value
            )
          })

          const result = await response.json()
          console.log('DEBUG: Relayer response:', result)

          if (!result.success) {
            setMessage({ type: 'error', text: result.message || 'Batch withdrawal failed' })
          } else {
            setMessage({ type: 'success', text: 'Batch withdrawal submitted successfully!' })
          }
        } catch (error) {
          console.error('DEBUG: Relayer call error:', error)
          setMessage({
            type: 'error',
            text: error instanceof Error ? error.message : 'Failed to submit batch withdrawal'
          })
        }
      }
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
