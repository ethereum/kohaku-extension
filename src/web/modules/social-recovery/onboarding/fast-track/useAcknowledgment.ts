/**
 * Whether the holder acknowledged the warning on the way to this step. The
 * acknowledgment travels only in the router state of the navigation that
 * brought the holder here, never in storage. This mount keeps it, and the
 * history entry drops it at once, so a reload or a direct URL of the same
 * step meets the warning again.
 */
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

import useNavigation from '@common/hooks/useNavigation'
import { acknowledgedInState } from '@web/modules/social-recovery/recovery/entry/search'

const useAcknowledgment = (): boolean => {
  const location = useLocation()
  const { navigate } = useNavigation()
  const fromState = acknowledgedInState(location.state)
  const [kept, setKept] = useState(fromState)

  useEffect(() => {
    if (!fromState) {
      return
    }
    setKept(true)
    navigate(`${location.pathname}${location.search}`, { replace: true })
  }, [fromState, location.pathname, location.search, navigate])

  return kept || fromState
}

export default useAcknowledgment
