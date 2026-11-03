/**
 * The headline of one listed session, through the recovery client of its
 * account: null while the client loads, where it cannot be built, and where
 * the assessment refuses the gathering, so a session it cannot read never
 * shows a count.
 */
import { useMemo } from 'react'

import { useRecoveryClient } from '@web/modules/social-recovery/shared/client/useRecoveryClient'

import { headlineOfAssessment } from './rows'
import type { ChecklistHeadline, InProgressItem } from './types'

const useSessionHeadline = (item: InProgressItem): ChecklistHeadline | null => {
  const clientState = useRecoveryClient(item.account)
  const kit = clientState.status === 'ready' ? clientState.client : null
  const { gathering } = item.session
  return useMemo(() => {
    if (!kit) {
      return null
    }
    try {
      return headlineOfAssessment(kit.recovery.assess(gathering, Math.floor(Date.now() / 1000)))
    } catch {
      return null
    }
  }, [kit, gathering])
}

export default useSessionHeadline
