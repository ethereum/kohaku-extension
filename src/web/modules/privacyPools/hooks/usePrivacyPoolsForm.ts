import { useEffect, useState } from 'react'
import { encodeFunctionData, formatEther, getAddress, parseEther } from 'viem'
import { Hash } from '@0xbow/privacy-pools-core-sdk'
import { PoolAccount } from '@web/contexts/privacyPoolsControllerStateContext'
import useBackgroundService from '@web/hooks/useBackgroundService'
import usePrivacyPoolsControllerState from '@web/hooks/usePrivacyPoolsControllerState'

import { english, generateMnemonic } from 'viem/accounts'
import { transformRagequitProofForContract } from '../utils/ragequit'
import { entrypointAbi, privacyPoolAbi } from '../utils/abi'

type PrivateRequestType = 'privateDepositRequest' | 'privateSendRequest' | 'privateRagequitRequest'

const usePrivacyPoolsForm = () => {
  const { dispatch } = useBackgroundService()
  const {
    chainData,
    seedPhrase,
    poolAccounts,
    depositAmount,
    targetAddress,
    accountService,
    withdrawalAmount,
    selectedPoolAccount,
    loadAccount,
    createDepositSecrets,
    setSelectedPoolAccount,
    generateRagequitProof
  } = usePrivacyPoolsControllerState()

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoadingAccount, setIsLoadingAccount] = useState(false)

  const [ragequitLoading, setRagequitLoading] = useState<Record<string, boolean>>({})

  const poolInfo = chainData?.[11155111]?.poolInfo?.[0]

  const handleUpdateForm = (params: { [key: string]: any }) => {
    dispatch({
      type: 'PRIVACY_POOLS_CONTROLLER_UPDATE_FORM',
      params: { ...params }
    })

    setMessage(null)
  }

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
  }

  const handleSelectedAccount = (poolAccount: PoolAccount) => {
    setSelectedPoolAccount((prevState) => {
      if (prevState?.name === poolAccount.name) {
        return null
      }

      return poolAccount
    })
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
    console.log('result', result)

    handlePrivateRequest('privateDepositRequest', [result])
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
    console.log('result', result)

    handlePrivateRequest('privateRagequitRequest', [result])
    setRagequitLoading((prev) => ({ ...prev, [accountKey]: false }))
  }

  const handleWithdrawal = async () => {
    // eslint-disable-next-line no-console
    console.log('handleWithdrawal')
  }

  return {
    message,
    poolInfo,
    chainData,
    seedPhrase,
    poolAccounts,
    isGenerating,
    depositAmount,
    targetAddress,
    accountService,
    withdrawalAmount,
    isLoadingAccount,
    selectedPoolAccount,
    isRagequitLoading,
    handleDeposit,
    handleRagequit,
    handleUpdateForm,
    handleLoadAccount,
    handleSelectedAccount,
    handleGenerateSeedPhrase,
    handleWithdrawal
  }
}

export default usePrivacyPoolsForm
