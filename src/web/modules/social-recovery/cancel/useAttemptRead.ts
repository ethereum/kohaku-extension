/**
 * The cancel screen's fresh read of the attempt on arrival, through the
 * watcher's poll at the latest block, and beside it the watcher's last
 * reading this device stored. While the fresh read runs, the last reading may
 * show, with the send held: nothing is sent on it. A read that fails shows
 * failed with a retry, never the last reading; the send opens only on the
 * fresh read's answer.
 */
import { useCallback, useEffect, useState } from 'react'

import type {
  ArrivalReader,
  AttemptRead,
  AttemptReadResult,
  LastReadingReader,
  StoredAttemptRead,
  StoredLastReading
} from './types'

const LOADING: AttemptRead = { status: 'loading' }

export const useAttemptRead = (
  readAttempt: ArrivalReader | null,
  readLast: LastReadingReader | null = null
): AttemptReadResult => {
  const [attempt, setAttempt] = useState(0)
  const [stored, setStored] = useState<StoredAttemptRead>({
    reader: null,
    attempt: 0,
    read: LOADING
  })
  const [last, setLast] = useState<StoredLastReading>({ reader: null, reading: null })

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

  useEffect(() => {
    if (!readLast) {
      return undefined
    }
    let live = true
    readLast().then(
      (reading) => {
        if (live) {
          setLast({ reader: readLast, reading: reading ?? null })
        }
      },
      () => undefined
    )
    return () => {
      live = false
    }
  }, [readLast])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  const current = stored.reader === readAttempt && stored.attempt === attempt
  return {
    read: current && readAttempt ? stored.read : LOADING,
    last: readLast && last.reader === readLast ? last.reading : null,
    retry
  }
}
