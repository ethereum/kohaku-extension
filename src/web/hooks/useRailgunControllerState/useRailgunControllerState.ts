import { useContext } from 'react'

import { RailgunControllerStateContext } from '@web/contexts/railgunControllerStateContext'

export default function useRailgunControllerState() {
  const context = useContext(RailgunControllerStateContext)

  if (!context) {
    throw new Error(
      'useRailgunControllerState must be used within a RailgunControllerStateProvider'
    )
  }

  return context
}
