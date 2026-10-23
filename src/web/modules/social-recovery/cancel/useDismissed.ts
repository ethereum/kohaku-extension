/**
 * The attempts the holder dismissed for one account, read from the watcher's
 * record again each time the watched state changes, which it does on every
 * write of the record; the last list read for the account stands meanwhile.
 * Only an ended attempt needs it: the watched state already says whether the
 * open attempt is dismissed.
 */
import { useEffect, useState } from 'react'

import type { Address } from '@kohaku-eth/social-recovery'
import { CHAIN_IDS, WALLET_RECOVERY_CHAIN } from '@web/modules/social-recovery/shared/client/chains'
import { extensionRecordStorage } from '@web/modules/social-recovery/shared/records/extensionStorage'
import { readWatcherRecord } from '@web/modules/social-recovery/watcher'
import type { WatchedAttemptState, WatcherStorage } from '@web/modules/social-recovery/watcher'

import type { HeldDismissed } from './types'

export const useDismissed = (
  account: Address,
  state: WatchedAttemptState,
  storage: WatcherStorage = extensionRecordStorage
): bigint[] | undefined => {
  const [held, setHeld] = useState<HeldDismissed | null>(null)
  const ended = state.status === 'watched' && !state.reading?.attempt && !!state.reading?.ended

  useEffect(() => {
    if (!ended) {
      return undefined
    }
    let live = true
    readWatcherRecord(storage, CHAIN_IDS[WALLET_RECOVERY_CHAIN], account)
      .then((record) => {
        if (live) {
          setHeld({ account, dismissed: record?.dismissed ?? [] })
        }
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [account, state, ended, storage])

  return held && held.account === account ? held.dismissed : undefined
}
