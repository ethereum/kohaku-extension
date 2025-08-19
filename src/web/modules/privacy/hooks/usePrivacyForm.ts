import { useState } from 'react'

import { PoolAccount } from '@web/contexts/privacyControllerStateContext'
import useBackgroundService from '@web/hooks/useBackgroundService'
import usePrivacyControllerState from '@web/hooks/usePrivacyControllerState'

import { generateSeedPhrase } from '../utils/seedPhrase'

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
    setSelectedPoolAccount
  } = usePrivacyControllerState()

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoadingAccount, setIsLoadingAccount] = useState(false)

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

  return {
    amount,
    message,
    chainData,
    seedPhrase,
    poolAccounts,
    isGenerating,
    targetAddress,
    accountService,
    isLoadingAccount,
    selectedPoolAccount,
    handleUpdateForm,
    handleLoadAccount,
    handlePrivateRequest,
    handleSelectedAccount,
    handleGenerateSeedPhrase
  }
}

export default usePrivacyForm
