import useBackgroundService from '@web/hooks/useBackgroundService'

type PrivateRequestType = 'privateDepositRequest' | 'privateSendRequest' | 'privateRagequitRequest'

export const usePP = () => {
  const { dispatch } = useBackgroundService()

  const actionExecutionType = 'open-action-window'

  const handlePrivateRequest = (type: PrivateRequestType) => {
    dispatch({
      type: 'REQUESTS_CONTROLLER_BUILD_REQUEST',
      params: { type, params: { actionExecutionType } }
    })
  }

  return {
    handlePrivateRequest
  }
}
