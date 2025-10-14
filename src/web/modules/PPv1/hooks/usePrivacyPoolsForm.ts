/* eslint-disable no-console */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useModalize } from 'react-native-modalize'
import { encodeFunctionData, formatEther, getAddress, parseUnits } from 'viem'
import { english, generateMnemonic } from 'viem/accounts'
import { Hash, type Withdrawal } from '@0xbow/privacy-pools-core-sdk'
import { Call } from '@ambire-common/libs/accountOp/types'
import { BatchWithdrawalParams } from '@ambire-common/controllers/privacyPools/privacyPools'
import { PoolAccount, ReviewStatus } from '@web/contexts/privacyPoolsControllerStateContext'
import useBackgroundService from '@web/hooks/useBackgroundService'
import usePrivacyPoolsControllerState from '@web/hooks/usePrivacyPoolsControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import { useStorage } from './useStorage'
import { prepareWithdrawalProofInput, transformProofForRelayerApi } from '../utils/withdrawal'
import { transformRagequitProofForContract } from '../utils/ragequit'
import { entrypointAbi, privacyPoolAbi } from '../utils/abi'

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
    setIsAccountLoaded,
    relayerQuote,
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
  const { getData, storeData, decrypt, encrypt } = useStorage({ password: 'test' })

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

  const [isRefreshing, setIsRefreshing] = useState(false)

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

  const prepareBatchWithdrawal = useCallback(
    (params: BatchWithdrawalParams): void => {
      dispatch({
        type: 'PRIVACY_POOLS_CONTROLLER_PREPARE_WITHDRAWAL',
        params
      })
    },
    [dispatch]
  )

  const handleGenerateSeedPhrase = async () => {
    setIsGenerating(true)
    setMessage(null)

    const newSeedPhrase = generateMnemonic(english)
    handleUpdateForm({ seedPhrase: newSeedPhrase })
    setMessage({ type: 'success', text: 'New seed phrase generated successfully!' })
    setIsGenerating(false)
  }

  const loadAccountWithSecrets = useCallback(
    async (
      secrets: { masterNullifierSeed: string; masterSecretSeed: string },
      shouldStore: boolean = false
    ) => {
      if (!secrets?.masterNullifierSeed || !secrets?.masterSecretSeed) {
        throw new Error('Please provide valid secrets to load an account.')
      }

      await loadAccount(
        secrets as { masterNullifierSeed: `0x${string}`; masterSecretSeed: `0x${string}` }
      )

      if (shouldStore) {
        const encrypted = await encrypt(JSON.stringify(secrets))
        await storeData({ key: 'TEST-private-account', data: encrypted })
      }
    },
    [loadAccount, encrypt, storeData]
  )

  const handleLoadAccount = useCallback(
    async (secrets?: { masterNullifierSeed: string; masterSecretSeed: string }) => {
      try {
        setMessage(null)
        setIsLoadingAccount(true)

        if (!secrets) {
          throw new Error('Secrets are required to load account')
        }

        await loadAccountWithSecrets(secrets, true)

        setMessage({ type: 'success', text: 'Account loaded successfully!' })
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to load account. Please try again.'
        setMessage({ type: 'error', text: errorMessage })
        throw error
      } finally {
        setIsLoadingAccount(false)
      }
    },
    [loadAccountWithSecrets]
  )

  const refreshPrivateAccount = useCallback(async () => {
    try {
      setIsRefreshing(true)
      setIsAccountLoaded(false)
      setMessage(null)
      setIsLoadingAccount(true)

      const data = await getData({ key: 'TEST-private-account' })
      if (!data) throw new Error('No stored private account found.')

      const decrypted = await decrypt(data)
      const secrets = JSON.parse(decrypted)
      await loadAccountWithSecrets(secrets)

      setRagequitLoading({})
      setMessage({ type: 'success', text: 'Account refreshed successfully!' })
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to refresh account. Please try again.'
      setMessage({ type: 'error', text: errorMessage })
    } finally {
      setIsLoadingAccount(false)
      setIsAccountLoaded(true)
      setIsRefreshing(false)
    }
  }, [setIsAccountLoaded, getData, decrypt, loadAccountWithSecrets])

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

  const loadPrivateAccount = useCallback(async () => {
    if (isAccountLoaded) return

    try {
      setIsLoadingSeedPhrase(true)
      setMessage(null)

      const data = await getData({ key: 'TEST-private-account' })
      if (!data) throw new Error('No stored private account found.')

      const decrypted = await decrypt(data)
      const secrets = JSON.parse(decrypted)
      await loadAccountWithSecrets(secrets)

      setMessage({ type: 'success', text: 'Private account loaded successfully!' })
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to load private account. Please try again.'
      setMessage({ type: 'error', text: errorMessage })
    } finally {
      setIsLoadingSeedPhrase(false)
    }
  }, [isAccountLoaded, getData, decrypt, loadAccountWithSecrets])

  const isLoading = isLoadingSeedPhrase || isLoadingAccount

  // Update controller with calculated batchSize whenever it changes
  useEffect(() => {
    handleUpdateForm({ batchSize: calculatedBatchSize })
    console.log('DEBUG: batchSize update', calculatedBatchSize)
  }, [calculatedBatchSize, handleUpdateForm])

  /**
   * Handles withdrawal using multiple pool accounts via relayer API
   * This version generates proofs and submits to the relayer endpoint
   */
  const handleMultipleWithdrawal = useCallback(async () => {
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
        chainId: 11155111,
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
    isRefreshing,
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
    loadPrivateAccount,
    refreshPrivateAccount
  }
}

export default usePrivacyPoolsForm
