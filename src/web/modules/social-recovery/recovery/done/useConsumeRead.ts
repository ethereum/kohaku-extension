/**
 * The consume event's read, once the client is ready and the countdown's
 * record told what the consume is matched against, and again on retry.
 * Until it answers it reads pending; a read that fails, or the extension
 * holding no network for the recovery chain to read the block time on, reads
 * failed, never the last answer.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { POLL_LIMIT_MS } from '@web/modules/social-recovery/recovery/checklist/constants'

import { readConsume } from './read'
import type { DoneRead, DoneReadHook, DoneReadInput } from './types'

const PENDING: DoneRead = { status: 'pending' }

const useConsumeRead = ({ kit, match, blockTime }: DoneReadInput): DoneReadHook => {
  const [read, setRead] = useState<DoneRead>(PENDING)
  const [attempt, setAttempt] = useState(0)
  const generation = useRef(0)

  useEffect(() => {
    generation.current += 1
    const id = generation.current
    if (!kit || !match) {
      setRead(PENDING)
      return undefined
    }
    if (!blockTime) {
      setRead({ status: 'failed' })
      return undefined
    }
    setRead(PENDING)
    // The read answers undefined for a throw or a read over its limit, and never rejects.
    readConsume(kit, match, blockTime, POLL_LIMIT_MS)
      .then((reading) => {
        if (id === generation.current) {
          setRead(reading ? { status: 'answered', reading } : { status: 'failed' })
        }
      })
      .catch(() => undefined)
    return () => {
      generation.current += 1
    }
  }, [kit, match, blockTime, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { read, retry }
}

export default useConsumeRead
