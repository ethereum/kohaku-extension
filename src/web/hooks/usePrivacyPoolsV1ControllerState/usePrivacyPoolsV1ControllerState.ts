import { useContext } from 'react'

import { PrivacyPoolsV1ControllerStateContext } from '@web/contexts/privacyPoolsV1ControllerStateContext/privacyPoolsV1ControllerStateContext'

export default function usePrivacyPoolsV1ControllerState() {
  return useContext(PrivacyPoolsV1ControllerStateContext)
}
