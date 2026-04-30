import React, { createContext, useEffect, useMemo } from 'react'

import { SelectedAccountController } from '@ambire-common/controllers/selectedAccount/selectedAccount'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useControllerState from '@web/hooks/useControllerState'
import useMainControllerState from '@web/hooks/useMainControllerState'

const SelectedAccountControllerStateContext = createContext<SelectedAccountController>(
  {} as SelectedAccountController
)

const SelectedAccountControllerStateProvider: React.FC<any> = ({ children }) => {
  const controller = 'selectedAccount'
  const state = useControllerState(controller)
  const { dispatch } = useBackgroundService()
  const mainState = useMainControllerState()

  useEffect(() => {
    if (!Object.keys(state).length)
      dispatch({ type: 'INIT_CONTROLLER_STATE', params: { controller } })
  }, [dispatch, mainState.isReady, state])

  return (
    <SelectedAccountControllerStateContext.Provider value={useMemo(() => state, [state])}>
      {children}
    </SelectedAccountControllerStateContext.Provider>
  )
}

export { SelectedAccountControllerStateProvider, SelectedAccountControllerStateContext }
