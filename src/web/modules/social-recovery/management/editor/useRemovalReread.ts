/**
 * Reads the removal's check after its landing again, where it disagreed: the
 * chain may have answered from an older block. A read that finds the setup
 * and the authorization both gone wipes this device's records and reads as
 * removed; a read that still finds either leaves the removal disagreed; a read
 * that does not answer reads as failed, with its retry. A press while one
 * reads does nothing.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { confirmOutcomeOf } from '@web/modules/social-recovery/setup/arm'

import type { RemovalReread, RemovalRereadInput, RemovalRereadStatus } from './types'

export const useRemovalReread = ({ steps, prepared }: RemovalRereadInput): RemovalReread => {
  const [status, setStatus] = useState<RemovalRereadStatus>('idle')
  const live = useRef(true)
  const reading = useRef(false)

  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  const reread = useCallback(() => {
    if (!steps || !prepared || reading.current) {
      return
    }
    reading.current = true
    setStatus('reading')
    confirmOutcomeOf(() => steps.confirm(prepared), { newBlock: steps.newBlock })
      .then(async (outcome): Promise<RemovalRereadStatus> => {
        if (outcome.kind === 'agreed') {
          // The removal stands on chain whether or not this device could drop its records.
          await steps.wipe().catch(() => undefined)
          return 'removed'
        }
        return outcome.kind === 'unread' ? 'failed' : 'idle'
      })
      .catch((): RemovalRereadStatus => 'failed')
      .then((next) => {
        reading.current = false
        if (live.current) {
          setStatus(next)
        }
      })
      .catch(() => undefined)
  }, [steps, prepared])

  return { status, reread }
}
