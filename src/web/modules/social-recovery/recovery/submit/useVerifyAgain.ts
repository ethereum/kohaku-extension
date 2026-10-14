/**
 * The verify again of every approval the submission carries, run once the
 * confirmation has its session and again on retry. A gathering that changes
 * starts it again, so no verdict of an earlier gathering stands for it.
 */
import { useCallback, useEffect, useState } from 'react'

import type { Gathering } from '@web/modules/social-recovery/sdk-interfaces'

import type { SubmitKitClient, VerifyHook, VerifyReading } from './types'
import { verifyAgain } from './verify'

const useVerifyAgain = (
  client: SubmitKitClient | null,
  gathering: Gathering | null,
  chosen: ReadonlySet<number> | null
): VerifyHook => {
  const [verify, setVerify] = useState<VerifyReading>({ status: 'checking' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!client || !gathering || !chosen) {
      setVerify({ status: 'checking' })
      return undefined
    }
    let live = true
    setVerify({ status: 'checking' })
    verifyAgain(client, gathering, chosen)
      .then((reading) => {
        if (live) {
          setVerify(reading)
        }
      })
      .catch(() => {
        if (live) {
          setVerify({ status: 'failed' })
        }
      })
    return () => {
      live = false
    }
  }, [client, gathering, chosen, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { verify, retry }
}

export default useVerifyAgain
