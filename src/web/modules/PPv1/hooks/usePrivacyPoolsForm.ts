import { useCallback, useState } from 'react'
import { useModalize } from 'react-native-modalize'
import { Address, encodeFunctionData, formatEther, getAddress, parseUnits } from 'viem'
import { english, generateMnemonic } from 'viem/accounts'
import { Hash, Withdrawal, WithdrawalProof } from '@0xbow/privacy-pools-core-sdk'
import { Call } from '@ambire-common/libs/accountOp/types'
import { PoolAccount } from '@web/contexts/privacyPoolsControllerStateContext'
import useBackgroundService from '@web/hooks/useBackgroundService'
import usePrivacyPoolsControllerState from '@web/hooks/usePrivacyPoolsControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import {
  prepareWithdrawalProofInput,
  prepareWithdrawRequest,
  transformProofForContract,
  validateWithdrawal,
  WithdrawalParams,
  WithdrawalResult
} from '../../PPv1-old/utils/withdrawal'
import { transformRagequitProofForContract } from '../../PPv1-old/utils/ragequit'
import { entrypointAbi, privacyPoolAbi } from '../../PPv1-old/utils/abi'
import { usePOC } from '../../PPv1-old/hooks/usePOC'

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
    targetAddress,
    accountService,
    withdrawalAmount,
    selectedPoolAccount,
    signAccountOpController,
    latestBroadcastedAccountOp,
    isAccountLoaded,
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

  const { account: userAccount } = useSelectedAccountControllerState()

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoadingSeedPhrase, setIsLoadingSeedPhrase] = useState(false)
  const [isLoadingAccount, setIsLoadingAccount] = useState(false)
  const [ragequitLoading, setRagequitLoading] = useState<Record<string, boolean>>({})
  const [showAddedToBatch] = useState(false)

  const poolInfo = chainData?.[11155111]?.poolInfo?.[0]

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

  const handleLoadAccount = async () => {
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
  }

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

  const syncSignAccountOp = async (calls: Call[]) => {
    console.log('DEBUG: Dispatching PRIVACY_POOLS_CONTROLLER_SYNC_SIGN_ACCOUNT_OP', calls)
    dispatch({
      type: 'PRIVACY_POOLS_CONTROLLER_SYNC_SIGN_ACCOUNT_OP',
      params: { calls }
    })
    console.log('DEBUG: Dispatch completed')
  }

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

    // eslint-disable-next-line no-console
    console.log('DEUBG: result', result)

    handlePrivateRequest('privateRagequitRequest', [result])
    setRagequitLoading((prev) => ({ ...prev, [accountKey]: false }))
  }

  /**
   * Generates withdrawal proof and prepares transaction data
   */
  const generateWithdrawalData = async ({
    commitment,
    amount,
    decimals,
    target,
    relayerAddress,
    feeBPSForWithdraw,
    poolScope,
    stateLeaves,
    aspLeaves,
    entrypointAddress
  }: Omit<WithdrawalParams, 'poolAddress'>): Promise<{
    withdrawal: Withdrawal
    proof: WithdrawalProof
    transformedArgs: ReturnType<typeof transformProofForContract>
    error?: string
  }> => {
    try {
      // Prepare withdrawal request
      const withdrawal = prepareWithdrawRequest(
        getAddress(target),
        getAddress(entrypointAddress),
        getAddress(relayerAddress),
        feeBPSForWithdraw.toString()
      )
      // Generate merkle proofs
      const stateMerkleProof = getMerkleProof(stateLeaves?.map(BigInt) as bigint[], commitment.hash)
      const aspMerkleProof = getMerkleProof(aspLeaves?.map(BigInt), commitment.label)
      // Calculate context
      const context = getContext(withdrawal, poolScope)
      // Create withdrawal secrets
      const { secret, nullifier } = createWithdrawalSecrets(commitment)
      // Workaround for NaN index, SDK issue
      aspMerkleProof.index = Object.is(aspMerkleProof.index, NaN) ? 0 : aspMerkleProof.index
      // Prepare withdrawal proof input
      const withdrawalProofInput = prepareWithdrawalProofInput(
        commitment,
        parseUnits(amount, decimals),
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
      // Transform proof for contract interaction
      const transformedArgs = transformProofForContract(proof)

      return { withdrawal, proof, transformedArgs }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to generate withdrawal data'
      return {
        withdrawal: {} as Withdrawal,
        proof: {} as WithdrawalProof,
        transformedArgs: {} as ReturnType<typeof transformProofForContract>,
        error: errorMessage
      }
    }
  }

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

  const executeWithdrawalTransaction = async ({
    commitment,
    amount,
    decimals,
    target,
    relayerAddress,
    feeBPSForWithdraw,
    poolScope,
    stateLeaves,
    aspLeaves,
    userAddress,
    entrypointAddress
  }: WithdrawalParams): Promise<WithdrawalResult> => {
    const { withdrawal, proof, transformedArgs, error } = await generateWithdrawalData({
      commitment,
      amount,
      decimals,
      target,
      relayerAddress,
      feeBPSForWithdraw,
      poolScope,
      stateLeaves,
      aspLeaves,
      userAddress,
      entrypointAddress
    })

    if (error || !withdrawal || !proof || !transformedArgs) {
      return {
        to: getAddress(entrypointAddress),
        data: '0x',
        value: 0n
      }
    }

    const result = encodeFunctionData({
      abi: entrypointAbi,
      functionName: 'relay',
      args: [
        {
          processooor: getAddress(entrypointAddress),
          data: withdrawal.data
        },
        {
          pA: transformedArgs.pA,
          pB: transformedArgs.pB,
          pC: transformedArgs.pC,
          pubSignals: transformedArgs.pubSignals
        },
        poolScope
      ]
    })

    return {
      to: getAddress(entrypointAddress),
      data: result,
      value: 0n
    }
  }

  const handleWithdrawal = async (poolAccount: PoolAccount) => {
    const { error, isValid } = validateWithdrawal(poolAccount, withdrawalAmount, targetAddress)

    if (
      !isValid ||
      !poolInfo ||
      !mtLeaves ||
      !mtRoots ||
      !accountService ||
      !targetAddress ||
      !withdrawalAmount ||
      !userAccount
    ) {
      setMessage(error)
      return
    }

    const target = getAddress(targetAddress)
    const selectedPoolInfo = poolInfo
    const relayerAddress = userAccount.addr as Address
    const decimals = selectedPoolInfo?.assetDecimals || 18
    const feeBPSForWithdraw = 0

    const aspLeaves = mtLeaves?.aspLeaves
    const stateLeaves = mtLeaves?.stateTreeLeaves
    const commitment = poolAccount.lastCommitment

    const withdrawalParams: WithdrawalParams = {
      commitment,
      amount: formatEther(BigInt(withdrawalAmount)),
      decimals,
      target,
      relayerAddress,
      feeBPSForWithdraw,
      poolScope: selectedPoolInfo.scope as Hash,
      stateLeaves,
      aspLeaves,
      userAddress: userAccount.addr as Address,
      entrypointAddress: poolInfo.entryPointAddress
    }

    const result = await executeWithdrawalTransaction(withdrawalParams)

    handlePrivateRequest('privateWithdrawRequest', [result])
  }

  return {
    message,
    poolInfo,
    chainData,
    seedPhrase,
    poolAccounts,
    hasProceeded,
    isGenerating,
    depositAmount,
    targetAddress,
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
    handleDeposit,
    handleRagequit,
    handleWithdrawal,
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
