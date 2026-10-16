/**
 * The cancel screen's fresh read of the attempt on arrival, through the
 * watcher's poll at the latest block. A read that fails, or has not returned,
 * never renders as the last good state: it reads loading, or failed with a
 * retry.
 */
import { useCallback, useEffect, useState } from 'react'

import type { ArrivalReader, AttemptRead, AttemptReadResult, StoredAttemptRead } from './types'

const LOADING: AttemptRead = { status: 'loading' }

export const useAttemptRead = (readAttempt: ArrivalReader | null): AttemptReadResult => {
  const [attempt, setAttempt] = useState(0)
  const [stored, setStored] = useState<StoredAttemptRead>({
    reader: null,
    attempt: 0,
    read: LOADING
  })

  useEffect(() => {
    if (!readAttempt) {
      return undefined
    }
    let live = true
    setStored({ reader: readAttempt, attempt, read: LOADING })
    readAttempt()
      .then((arrival) => {
        if (live) {
          setStored({ reader: readAttempt, attempt, read: { status: 'read', arrival } })
        }
      })
      .catch(() => {
        if (live) {
          setStored({ reader: readAttempt, attempt, read: { status: 'failed' } })
        }
      })
    return () => {
      live = false
    }
  }, [readAttempt, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  const current = stored.reader === readAttempt && stored.attempt === attempt
  return { read: current && readAttempt ? stored.read : LOADING, retry }
}
