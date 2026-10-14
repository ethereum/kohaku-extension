/**
 * The headline of one countdown on the home surface, from the attempt read of
 * its account and its countdown's record on the checklist's poll period: one
 * round at once, then on every period and whenever the tab returns to view;
 * rounds never overlap. Waiting with the countdown's anchor or execution due
 * only where the attempt read is the one the submission landed (its id, setup
 * number and payload hash), so a rival's attempt never lends its number; any
 * other reading, which the wait itself names, otherwise. Null while the client
 * or the first read loads, and after a round that fails or runs past its
 * limit, so the home surface never shows a number from a read that did not
 * answer and a cancel never hides behind one.
 */
import { useEffect, useMemo, useRef, useState } from 'react'

import type { Address } from '@web/modules/social-recovery/sdk-interfaces'
import { isVisible } from '@web/modules/social-recovery/shared/ceremony'
import {
  CHAIN_IDS,
  WALLET_RECOVERY_CHAIN,
  within
} from '@web/modules/social-recovery/shared/client'
import { useRecoveryClient } from '@web/modules/social-recovery/shared/client/useRecoveryClient'
import {
  createWalletRecords,
  extensionRecordStorage
} from '@web/modules/social-recovery/shared/records'
import {
  CHECKLIST_POLL_MS,
  POLL_LIMIT_MS
} from '@web/modules/social-recovery/recovery/checklist/constants'

import { isAttemptOf, landedAttemptOf } from './read'
import type { CountdownHeadline } from './types'

const CHAIN_ID = CHAIN_IDS[WALLET_RECOVERY_CHAIN]

const useCountdownHeadline = (account: Address): CountdownHeadline | null => {
  const clientState = useRecoveryClient(account)
  const kit = clientState.status === 'ready' ? clientState.client : null
  const records = useMemo(() => createWalletRecords({ storage: extensionRecordStorage }), [])
  const [headline, setHeadline] = useState<CountdownHeadline | null>(null)
  const rounds = useRef(0)

  useEffect(() => {
    setHeadline(null)
    if (!kit) {
      return undefined
    }
    let live = true
    let inFlight = false
    const run = async () => {
      if (inFlight) {
        return
      }
      inFlight = true
      const answer = await within(
        () =>
          Promise.all([kit.recovery.recoveryState(), records.countdown(CHAIN_ID, account).read()]),
        POLL_LIMIT_MS
      )
      inFlight = false
      if (!live) {
        return
      }
      if (!answer) {
        setHeadline(null)
        return
      }
      const [{ attempt, block }, countdown] = answer
      const landed = countdown.status === 'present' ? landedAttemptOf(countdown.value) : null
      rounds.current += 1
      if (attempt.state !== 'Waiting' || !landed || !isAttemptOf(attempt, landed)) {
        setHeadline({ kind: 'other' })
      } else if (attempt.consumableAfter <= block.timestamp) {
        setHeadline({ kind: 'executionDue' })
      } else {
        setHeadline({
          kind: 'waiting',
          anchor: {
            endMs: attempt.consumableAfter * 1000,
            blockMs: block.timestamp * 1000,
            round: rounds.current
          }
        })
      }
    }
    run().catch(() => undefined)
    const timer = setInterval(() => {
      run().catch(() => undefined)
    }, CHECKLIST_POLL_MS)
    const onChange = () => {
      if (isVisible(document)) {
        run().catch(() => undefined)
      }
    }
    document.addEventListener('visibilitychange', onChange)
    return () => {
      live = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onChange)
    }
  }, [kit, records, account])

  return headline
}

export default useCountdownHeadline
