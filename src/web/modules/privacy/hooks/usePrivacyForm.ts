import useBackgroundService from '@web/hooks/useBackgroundService'
import usePrivacyControllerState from '@web/hooks/usePrivacyControllerState'

const usePrivacyForm = () => {
  const { dispatch } = useBackgroundService()
  const { amount, seedPhrase, targetAddress, chainData, loadAccount } = usePrivacyControllerState()

  const handleUpdateForm = (params: { [key: string]: any }) => {
    dispatch({
      type: 'PRIVACY_CONTROLLER_UPDATE_FORM',
      params: { ...params }
    })
  }

  return {
    amount,
    targetAddress,
    seedPhrase,
    chainData,
    loadAccount,
    handleUpdateForm
  }
}

export default usePrivacyForm
