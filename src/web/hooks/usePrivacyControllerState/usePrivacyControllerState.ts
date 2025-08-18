import { useContext } from 'react'

import { PrivacyControllerStateContext } from '@web/contexts/privacyControllerStateContext'

export default function usePrivacyControllerState() {
  const context = useContext(PrivacyControllerStateContext)

  if (!context) {
    throw new Error(
      'usePrivacyControllerState must be used within a PrivacyControllerStateProvider'
    )
  }

  return context
}
