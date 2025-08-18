import { useState } from 'react'

import useBackgroundService from '@web/hooks/useBackgroundService'
import usePrivacyControllerState from '@web/hooks/usePrivacyControllerState'

import { generateSeedPhrase } from '../utils/seedPhrase'

const usePrivacyForm = () => {
  const { dispatch } = useBackgroundService()
  const { amount, seedPhrase, targetAddress, chainData, loadAccount } = usePrivacyControllerState()

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoadingAccount, setIsLoadingAccount] = useState(false) // TODO: Move this state to the controller

  const handleUpdateForm = (params: { [key: string]: any }) => {
    dispatch({
      type: 'PRIVACY_CONTROLLER_UPDATE_FORM',
      params: { ...params }
    })

    setMessage(null)
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

  return {
    amount,
    message,
    chainData,
    seedPhrase,
    isGenerating,
    targetAddress,
    isLoadingAccount,
    loadAccount,
    handleUpdateForm,
    handleGenerateSeedPhrase
  }
}

export default usePrivacyForm
