/**
 * The watcher's record of one account on the recovery chain, for a page: read
 * from the extension's local storage, then followed through its change events
 * for that key alone. A failed last poll comes back beside the last good
 * reading, never in its place. A storage read that fails, or a stored value
 * that is not a watcher record, reads as failed with a retry, never as an
 * account the watcher has not polled. A reading of another deployment than
 * the one this build reads is not shown: the account reads as not polled
 * until the watcher polls it.
 */
import { useCallback, useEffect, useState } from 'react'

import type { Address } from '@kohaku-eth/social-recovery'
import {
  browserReportStore,
  browserReportSubscribe
} from '@web/modules/social-recovery/shared/ceremony/screen/browserDefaults'
import { addressBookOf } from '@web/modules/social-recovery/shared/client/addresses'
import { CHAIN_IDS, WALLET_RECOVERY_CHAIN } from '@web/modules/social-recovery/shared/client/chains'
import { isOfDeployment } from '@web/modules/social-recovery/shared/records/deployment'

import { attemptDismissed, watcherKeyOf, watcherRecordFrom } from './record'
import type { WatchedAttemptSources, WatchedAttemptState } from './types'

const LOADING: WatchedAttemptState = { status: 'loading' }

const BROWSER_SOURCES: WatchedAttemptSources = {
  read: (key) => browserReportStore.get(key),
  subscribe: browserReportSubscribe
}

export const useWatchedAttempt = (
  account: Address | undefined,
  sources: WatchedAttemptSources = BROWSER_SOURCES
): WatchedAttemptState => {
  const key = account ? watcherKeyOf(CHAIN_IDS[WALLET_RECOVERY_CHAIN], account) : undefined
  const [reads, setReads] = useState(0)
  const retry = useCallback(() => setReads((count) => count + 1), [])
  const [stored, setStored] = useState<{
    key?: string
    reads?: number
    state: WatchedAttemptState
  }>({ state: LOADING })

  useEffect(() => {
    if (!key) {
      return undefined
    }
    const stateOf = (value: unknown): WatchedAttemptState => {
      if (value === undefined) {
        return { status: 'unwatched' }
      }
      const record = watcherRecordFrom(value)
      if (!record) {
        return { status: 'failed', retry }
      }
      // A reading of another deployment, or one that names none, is none of this build's until a poll.
      if (
        record.reading &&
        !isOfDeployment(record.reading.deployment, addressBookOf(WALLET_RECOVERY_CHAIN))
      ) {
        return { status: 'unwatched' }
      }
      return {
        status: 'watched',
        ...(record.reading ? { reading: record.reading } : {}),
        ...(record.failed ? { failed: record.failed } : {}),
        attemptDismissed: attemptDismissed(record)
      }
    }
    let live = true
    let changed = false
    const unsubscribe = sources.subscribe(key, (value) => {
      if (live) {
        changed = true
        setStored({ key, reads, state: stateOf(value) })
      }
    })
    sources.read(key).then(
      (value) => {
        // A change event that arrived first is newer than this read.
        if (live && !changed) {
          setStored({ key, reads, state: stateOf(value) })
        }
      },
      () => {
        if (live && !changed) {
          setStored({ key, reads, state: { status: 'failed', retry } })
        }
      }
    )
    return () => {
      live = false
      unsubscribe()
    }
  }, [key, reads, retry, sources])

  return stored.key === key && stored.reads === reads && key !== undefined ? stored.state : LOADING
}
