/**
 * The setup state of the tab's account, read once the recovery client stands,
 * with a retry. A client that did not build, or a read that failed or has not
 * returned, never reads as no setup. An answer read through a client the
 * screen no longer holds, as after an account change, is dropped.
 */
import { useCallback, useEffect, useState } from 'react'

import { overviewKindOf } from '@web/modules/social-recovery/management/overview/readings'
import type { RecoveryClientState } from '@web/modules/social-recovery/shared/client/types'

import type { SetupEntry, SetupEntryRead } from './types'

export const useSetupEntry = (client: RecoveryClientState & { retry: () => void }): SetupEntry => {
  const kit = client.status === 'ready' ? client.client : null
  const [round, setRound] = useState(0)
  const [read, setRead] = useState<SetupEntryRead | null>(null)

  useEffect(() => {
    if (!kit) {
      return undefined
    }
    let live = true
    kit.setup.setupState().then(
      (setup) => {
        if (live) {
          setRead({ kit, round, setup })
        }
      },
      () => {
        if (live) {
          setRead({ kit, round, setup: null })
        }
      }
    )
    return () => {
      live = false
    }
  }, [kit, round])

  const retryRead = useCallback(() => setRound((n) => n + 1), [])

  if (client.status === 'loading') {
    return { status: 'connecting' }
  }
  if (client.status === 'update-the-wallet') {
    return { status: 'update-the-wallet' }
  }
  if (client.status === 'failed') {
    return { status: 'failed', retry: client.retry }
  }
  if (!read || read.kit !== kit || read.round !== round) {
    return { status: 'reading' }
  }
  if (!read.setup) {
    return { status: 'failed', retry: retryRead }
  }
  return { status: 'answered', kind: overviewKindOf(read.setup) }
}
