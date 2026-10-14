/**
 * The lookup's setup read on the looked-up account's client. A read that
 * throws is failed, never an answer that no setup exists; a retry reads again.
 */
import { useCallback, useEffect, useState } from 'react'

import type { SetupState } from '@web/modules/social-recovery/sdk-interfaces'

import type { EntryKitClient, EntryRead } from './types'

const PENDING = { status: 'pending' } as const

export const useSetupRead = (
  client: EntryKitClient | null
): { setupState: EntryRead<SetupState>; retry: () => void } => {
  const [setupState, setSetupState] = useState<EntryRead<SetupState>>(PENDING)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    setSetupState(PENDING)
    if (!client) {
      return undefined
    }
    let live = true
    Promise.resolve()
      .then(() => client.setup.setupState())
      .then(
        (value) => {
          if (live) {
            setSetupState({ status: 'answered', value })
          }
        },
        () => {
          if (live) {
            setSetupState({ status: 'failed' })
          }
        }
      )
    return () => {
      live = false
    }
  }, [client, attempt])

  const retry = useCallback(() => setAttempt((count) => count + 1), [])
  return { setupState, retry }
}
