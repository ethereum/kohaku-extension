import { useContext } from 'react'

import { PrivacyPoolsControllerStateContext } from '@web/contexts/privacyPoolsControllerStateContext'

export default function usePrivacyPoolsControllerState() {
  const context = useContext(PrivacyPoolsControllerStateContext)

  if (!context) {
    throw new Error(
      'usePrivacyPoolsControllerState must be used within a PrivacyPoolsControllerStateProvider'
    )
  }

  return context
}
