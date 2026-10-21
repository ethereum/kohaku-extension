/**
 * The running attempt's band with its two exits. Continue with that key reads
 * the registry once more, then keeps the countdown only where that read names
 * the attempt the band showed when pressed, with the recovery entry under the account that holds the attempt's
 * key, and opens the wait; the recoverer's own session may be gone, and the
 * attempt lives on chain. An attempt that ended meanwhile leaves the band
 * saying so, and another attempt found in its place is drawn instead; neither
 * keeps a countdown. A session the records keep instead is the one the wait
 * follows. The cancel opens the cancel's own tab for the account.
 */
import React, { useCallback, useMemo, useState } from 'react'

import { cancelPathOf } from '@web/modules/social-recovery/cancel'
import { waitPathOf } from '@web/modules/social-recovery/recovery/checklist/search'

import { isSameAttempt } from './running'
import RunningAttemptBandView from './RunningAttemptBandView'
import type { ContinueState, RunningAttemptBandProps } from './types'

const RunningAttemptBand = ({
  state,
  claim,
  account,
  chainId,
  deployment,
  records,
  navigate
}: RunningAttemptBandProps) => {
  const { attempt, refreshFailed, opening, authority, entries, retry, recheck } = state
  const { ownership, target } = claim
  const [continueState, setContinueState] = useState<ContinueState>('idle')
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])

  const onContinue = useCallback(() => {
    if (
      !target ||
      attempt.status !== 'answered' ||
      opening.status !== 'answered' ||
      continueState === 'writing'
    ) {
      return
    }
    const { openedAt } = opening.value
    const shown = attempt.value
    setContinueState('writing')
    const run = async (): Promise<boolean> => {
      const checked = await recheck()
      if (checked.status === 'failed') {
        throw new Error('The registry did not answer before the countdown was kept.')
      }
      if (checked.status !== 'same' || !isSameAttempt(checked.attempt, shown)) {
        return false
      }
      const running = checked.attempt
      await records.restoreCountdown(
        chainId,
        account,
        {
          attemptId: running.attemptId,
          setupNonce: running.setupNonce,
          payloadHash: running.payloadHash,
          openedAtMs: openedAt * 1000,
          deployment
        },
        target
      )
      return true
    }
    run().then(
      (kept) => {
        setContinueState('idle')
        if (kept) {
          navigate(waitPathOf(account))
        }
      },
      () => setContinueState('failed')
    )
  }, [
    target,
    attempt,
    opening,
    continueState,
    recheck,
    records,
    chainId,
    account,
    deployment,
    navigate
  ])

  const onCancel = useCallback(() => navigate(cancelPathOf(account)), [navigate, account])

  return (
    <RunningAttemptBandView
      attempt={attempt}
      refreshFailed={refreshFailed}
      opening={opening}
      entries={entries}
      ownership={ownership}
      authority={authority}
      canContinue={!!target}
      continueState={continueState}
      timeZone={timeZone}
      onRetry={retry}
      onContinue={onContinue}
      onCancel={onCancel}
    />
  )
}

export default React.memo(RunningAttemptBand)
