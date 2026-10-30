/**
 * The reads after the holder confirmed the account, one after the other: the
 * authorization read, then the fit reads, then the reads about the key a
 * recovery installs. A read starts only once the one before it answered and
 * let the step go on; a read that throws is failed and holds back the ones
 * after it. A retry runs the failed read again and the ones after it.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import type { Address } from '@kohaku-eth/social-recovery'

import { readWithin } from '@web/modules/social-recovery/shared/client'

import { CONFIRMED_READ_LIMIT_MS_STAND_IN, CONFIRMED_STAGES } from './constants'
import { readDestination, readFit } from './reads'
import { recoverRefusalOf } from './refusal'
import type {
  ConfirmedReads,
  ConfirmedReadsState,
  ConfirmedStage,
  EntryKitClient,
  EntryRead
} from './types'

// A read that does not answer within its limit is failed, and its retry runs it again.
const settle = <T>(read: () => Promise<T>): Promise<EntryRead<T>> =>
  readWithin(read, CONFIRMED_READ_LIMIT_MS_STAND_IN).then(
    (value): EntryRead<T> => ({ status: 'answered', value }),
    (): EntryRead<T> => ({ status: 'failed' })
  )

/** The reads kept before a stage: a run from that stage starts it and the ones after it over. */
const keptBefore = (reads: ConfirmedReads, from: ConfirmedStage): ConfirmedReads => {
  const kept: ConfirmedReads = {}
  if (from !== 'authorization') {
    kept.authorization = reads.authorization
  }
  if (from === 'destination') {
    kept.fit = reads.fit
  }
  return kept
}

export const useConfirmedReads = (
  client: EntryKitClient | null,
  destination: Address,
  active: boolean
): ConfirmedReadsState => {
  const [reads, setReads] = useState<ConfirmedReads>({})
  const readsRef = useRef<ConfirmedReads>({})
  readsRef.current = reads
  // Each run counts a round; an answer from an earlier round lands nowhere.
  const round = useRef(0)

  const put = useCallback((next: ConfirmedReads) => {
    readsRef.current = next
    setReads(next)
  }, [])

  const run = useCallback(
    async (from: ConfirmedStage) => {
      if (!client) {
        return
      }
      round.current += 1
      const at = round.current
      const live = () => round.current === at
      let held = keptBefore(readsRef.current, from)
      put(held)

      if (from === 'authorization') {
        held = { ...held, authorization: { status: 'pending' } }
        put(held)
        const authorization = await settle(() => client.action.isAuthorized())
        if (!live()) {
          return
        }
        held = { ...held, authorization }
        put(held)
        if (authorization.status !== 'answered' || !authorization.value) {
          return
        }
      }

      if (from !== 'destination') {
        held = { ...held, fit: { status: 'pending' } }
        put(held)
        const fit = await settle(() => readFit(client))
        if (!live()) {
          return
        }
        held = { ...held, fit }
        put(held)
        if (fit.status !== 'answered' || recoverRefusalOf(fit.value)) {
          return
        }
      }

      if (held.fit?.status !== 'answered') {
        return
      }
      held = { ...held, destination: { status: 'pending' } }
      put(held)
      const answered = await settle(() => readDestination(client, destination))
      if (!live()) {
        return
      }
      put({ ...held, destination: answered })
    },
    [client, destination, put]
  )

  useEffect(() => {
    if (active) {
      // Every read settles into its own state, so the run itself never rejects.
      run('authorization').catch(() => undefined)
    } else {
      round.current += 1
      put({})
    }
    return () => {
      round.current += 1
    }
  }, [active, run, put])

  const retry = useCallback(() => {
    const failed = CONFIRMED_STAGES.find((stage) => readsRef.current[stage]?.status === 'failed')
    if (failed) {
      run(failed).catch(() => undefined)
    }
  }, [run])

  return { ...reads, retry }
}
