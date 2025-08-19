import { useEffect, useState } from 'react'
import { formatEther, parseEther } from 'viem'
import { Hash } from '@0xbow/privacy-pools-core-sdk'
import { PoolAccount } from '@web/contexts/privacyControllerStateContext'
import useBackgroundService from '@web/hooks/useBackgroundService'
import usePrivacyControllerState from '@web/hooks/usePrivacyControllerState'

import { generateSeedPhrase } from '../utils/seedPhrase'
import { prepareDepositTransaction } from '../utils/privacy/deposit'

type PrivateRequestType = 'privateDepositRequest' | 'privateSendRequest' | 'privateRagequitRequest'

const usePrivacyForm = () => {
  const { dispatch } = useBackgroundService()
  const {
    amount,
    seedPhrase,
    targetAddress,
    chainData,
    poolAccounts,
    accountService,
    selectedPoolAccount,
    loadAccount,
    createDepositSecrets,
    setSelectedPoolAccount
  } = usePrivacyControllerState()

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoadingAccount, setIsLoadingAccount] = useState(false)
  const [displayAmountValue, setDisplayAmountValue] = useState('')

  const poolInfo = chainData?.[11155111]?.poolInfo?.[0]

  const handleUpdateForm = (params: { [key: string]: any }) => {
    dispatch({
      type: 'PRIVACY_CONTROLLER_UPDATE_FORM',
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
    try {
      setIsGenerating(true)
      setMessage(null)

      const newSeedPhrase = generateSeedPhrase()
      handleUpdateForm({ seedPhrase: newSeedPhrase })
      setMessage({ type: 'success', text: 'New seed phrase generated successfully!' })
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to generate seed phrase. Please try again.'
      setMessage({ type: 'error', text: errorMessage })
    } finally {
      setIsGenerating(false)
    }
  }

  const handleLoadAccount = async () => {
    if (!seedPhrase?.trim()) {
      setMessage({ type: 'error', text: 'Please enter a seed phrase to load an existing account.' })
      return
    }

    setMessage(null)
    setIsLoadingAccount(true)

    loadAccount()
      .then(() => {
        setMessage({ type: 'success', text: 'Account loaded successfully!' })
      })
      .catch((error) => {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to load account. Please try again.'
        setMessage({ type: 'error', text: errorMessage })
      })
      .finally(() => {
        setIsLoadingAccount(false)
      })
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
    if (!amount || !poolInfo) return

    const secrets = createDepositSecrets(poolInfo.scope as Hash)

    const result = await prepareDepositTransaction({
      amount: formatEther(BigInt(amount)),
      depositSecrets: secrets,
      entryPointAddress: poolInfo.entryPointAddress
    })

    // eslint-disable-next-line no-console
    console.log('result', result)

    handlePrivateRequest('privateDepositRequest', [result])
  }

  const handleAmountChange = (inputValue: string) => {
    setDisplayAmountValue(inputValue)

    try {
      if (inputValue === '') {
        handleUpdateForm({ amount: '0' })
        return
      }

      if (inputValue.endsWith('.') || inputValue === '0.' || /^\d*\.0*$/.test(inputValue)) {
        return
      }

      const numValue = parseFloat(inputValue)
      if (Number.isNaN(numValue) || numValue < 0) {
        return
      }

      const weiAmount = parseEther(inputValue)
      handleUpdateForm({ amount: weiAmount.toString() })
    } catch (error) {
      console.warn('Invalid ETH amount entered:', inputValue)
    }
  }

  const handleSetMaxAmount = (balance: bigint) => {
    if (balance && balance > 0n) {
      const formattedAmount = formatEther(balance)
      setDisplayAmountValue(formattedAmount)
      handleUpdateForm({ amount: parseEther(formattedAmount).toString() })
    } else {
      setDisplayAmountValue('')
      handleUpdateForm({ amount: '0' })
    }
  }

  useEffect(() => {
    if (amount && amount !== '0') {
      try {
        setDisplayAmountValue(formatEther(BigInt(amount)))
      } catch {
        setDisplayAmountValue('')
      }
    } else {
      setDisplayAmountValue('')
    }
  }, [amount])

  return {
    amount,
    message,
    poolInfo,
    chainData,
    seedPhrase,
    poolAccounts,
    isGenerating,
    targetAddress,
    accountService,
    isLoadingAccount,
    displayAmountValue,
    selectedPoolAccount,
    handleDeposit,
    handleUpdateForm,
    handleLoadAccount,
    handleSetMaxAmount,
    handleAmountChange,
    handleSelectedAccount,
    handleGenerateSeedPhrase
  }
}

export default usePrivacyForm
