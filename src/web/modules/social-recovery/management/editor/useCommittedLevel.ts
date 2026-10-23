/**
 * The privacy level the committed setup was saved at, read from the setup
 * event as the overview's re-authorize reads it, with its failed state and
 * retry. A setup this build cannot read names no level.
 */
import { useCallback, useEffect, useState } from 'react'

import { levelOfReading } from '@web/modules/social-recovery/management/overview/readings'
import { readSetupReading } from '@web/modules/social-recovery/recovery/entry/readout'
import type { SetupState } from '@kohaku-eth/social-recovery'
import type { RecoveryKitClient } from '@web/modules/social-recovery/shared/client'

import type { CommittedLevel } from './types'

export const useCommittedLevel = (
  client: RecoveryKitClient | null,
  setup: SetupState | null
): { level: CommittedLevel; retry: () => void } => {
  const [level, setLevel] = useState<CommittedLevel>({ status: 'pending' })
  const [round, setRound] = useState(0)

  useEffect(() => {
    setLevel({ status: 'pending' })
    if (!client || !setup || !setup.hasSetup) {
      return undefined
    }
    let live = true
    readSetupReading(client, setup).then(
      (reading) => {
        if (!live) {
          return
        }
        const read = levelOfReading(reading)
        setLevel(read ? { status: 'answered', value: read } : { status: 'unreadable' })
      },
      () => {
        if (live) {
          setLevel({ status: 'failed' })
        }
      }
    )
    return () => {
      live = false
    }
  }, [client, setup, round])

  const retry = useCallback(() => setRound((at) => at + 1), [])
  return { level, retry }
}
