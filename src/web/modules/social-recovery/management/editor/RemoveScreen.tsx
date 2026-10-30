/**
 * The removal of recovery: the warning that the account will have no
 * recovery path, what the one transaction does, the typed confirmation whose
 * exact word alone enables the action, and while an attempt is open on the
 * account the line that removing recovery cancels it, above the action. The
 * removal clears the setup and removes the action's authorization in one
 * batch over the save's own run, in the shared states, and reads as done only
 * once the chain reads both gone and the records were wiped. A run that finds
 * both already gone sends nothing, says that the account has no recovery path
 * now, drawn apart from a removal it sent, and this device keeps nothing of
 * the setup. The removal reads the attempt again right before the send,
 * sends nothing over an open attempt the screen did not show, and the cancel
 * line follows that read. A check after the landing that disagrees offers to
 * read it again, which reads as removed once the chain reads both gone, or to
 * open the overview, which reads the setup that stands. A stored save of the
 * changes in flight sends the holder
 * to the review, and another screen's stored write to the overview; the
 * stored write is read again whenever the tab comes back into view.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import { useTranslation } from '@common/config/localization'
import useNavigation from '@common/hooks/useNavigation'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import ConfirmingBlock from '@web/modules/social-recovery/management/overview/ConfirmingBlock'
import { OVERVIEW } from '@web/modules/social-recovery/management/overview/constants'
import { useHeldKeys } from '@web/modules/social-recovery/management/overview/useHeldKeys'
import { useOverviewReads } from '@web/modules/social-recovery/management/overview/useOverviewReads'
import { PageTitle } from '@web/modules/social-recovery/shared/chrome'
import ReadFailedBlock from '@web/modules/social-recovery/shared/chrome/ReadFailedBlock'
import SetupChrome from '@web/modules/social-recovery/shared/chrome/SetupChrome'
import useSetupAccount from '@web/modules/social-recovery/shared/chrome/useSetupAccount'
import { CHAIN_IDS, WALLET_RECOVERY_CHAIN } from '@web/modules/social-recovery/shared/client'
import { useAccountFacts } from '@web/modules/social-recovery/shared/client/useAccountFacts'
import { useRecoveryClient } from '@web/modules/social-recovery/shared/client/useRecoveryClient'
import {
  createWalletRecords,
  extensionRecordStorage
} from '@web/modules/social-recovery/shared/records'
import { armScreenOf } from '@web/modules/social-recovery/setup/arm'
import { useArmRun } from '@web/modules/social-recovery/setup/arm/useArmRun'

import { REMOVE } from './constants'
import ReadsGate from './ReadsGate'
import RemoveArrival from './RemoveArrival'
import RemoveDisagreed from './RemoveDisagreed'
import RemoveDone from './RemoveDone'
import RemoveRun from './RemoveRun'
import { editSessionOf } from './session'
import { removalStepsOf, wipeRemovedSetup } from './steps'
import type { AttemptRead, EditStageProps } from './types'
import { useHeldWrite } from './useHeldWrite'
import { useRemovalReread } from './useRemovalReread'
import { useWriteSeams } from './useWriteSeams'

export const RemoveStageView = ({
  records,
  session,
  chainId,
  account,
  navigate
}: EditStageProps) => {
  const { t } = useTranslation()
  const clientState = useRecoveryClient(account)
  const heldKeys = useHeldKeys()
  const reads = useOverviewReads({
    client: clientState,
    records,
    watcherStorage: extensionRecordStorage,
    chainId,
    account,
    heldKeys
  })
  const kit = clientState.status === 'ready' ? clientState.client : null
  // The attempt as the removal last read it before the send; a new read of the overview's facts replaces it.
  const [attemptRead, setAttemptRead] = useState<AttemptRead | null>(null)
  useEffect(() => setAttemptRead(null), [reads.facts])
  const attemptOpen = attemptRead
    ? attemptRead.open
    : reads.facts.status === 'answered' && reads.facts.value.attemptOpen
  // Read by the removal before the send, which sends nothing over an attempt this screen did not show.
  const cancelLineShown = useRef(false)
  // Set once the screen with or without the line is committed, never from a render React may drop.
  useLayoutEffect(() => {
    cancelLineShown.current = attemptOpen
  }, [attemptOpen])
  const seams = useWriteSeams(chainId)
  const accountFacts = useAccountFacts(account)
  const { held, retry: retryHeld, refresh: refreshHeld } = useHeldWrite(records, chainId, account)
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (held.status === 'held' && held.write === 'manageEdit') {
      navigate(WEB_ROUTES.socialRecoveryManageReview)
    }
    if (held.status === 'other') {
      navigate(WEB_ROUTES.socialRecoveryManage)
    }
  }, [held, navigate])

  const ready = accountFacts.status === 'ready' ? accountFacts.facts : null
  const ownWrite =
    held.status === 'none' || (held.status === 'held' && held.write === 'manageRemove')
  const steps = useMemo(() => {
    if (!ready?.key || !kit || !ownWrite || clientState.status !== 'ready') {
      return null
    }
    return removalStepsOf({
      client: kit,
      reads: clientState.reads,
      receipts: clientState.receipts,
      port: seams.port,
      requests: seams.requests,
      records,
      session,
      chainId,
      account,
      facts: ready,
      key: ready.key,
      onAttempt: setAttemptRead,
      showsCancelLine: () => cancelLineShown.current
    })
  }, [ready, kit, ownWrite, clientState, seams, records, session, chainId, account])
  const run = useArmRun(steps, `manage:remove:${chainId}:${account.toLowerCase()}`, 'ownerWrite')
  const { state } = run
  const screen = armScreenOf(state)
  const check = useRemovalReread({ steps, prepared: state.prepared })

  // A run that read or lost its claim to another screen's write ends unsent, or stops for that
  // screen; the stored write is read again.
  useEffect(() => {
    if (
      state.lookup === 'failed' ||
      state.write.status === 'failedNotSent' ||
      state.stop === 'held-by-another-write'
    ) {
      refreshHeld()
    }
  }, [state.lookup, state.write.status, state.stop, refreshHeld])

  // A stop for another screen's write whose record is gone by the read again has nowhere to route
  // from the stored write; the overview reads everything again.
  useEffect(() => {
    if (state.stop !== 'held-by-another-write') {
      return undefined
    }
    let live = true
    records
      .saveInFlight(chainId, account)
      .read()
      .then(
        (read) => {
          if (live && read.status !== 'present') {
            navigate(WEB_ROUTES.socialRecoveryManage)
          }
        },
        () => undefined
      )
    return () => {
      live = false
    }
  }, [state.stop, records, chainId, account, navigate])

  // The chain holds no setup and no authorization: this device keeps nothing of the setup either.
  const endedElsewhere = screen === 'already-set-up'
  useEffect(() => {
    if (endedElsewhere) {
      wipeRemovedSetup({ records, session, chainId, account }).catch(() => undefined)
    }
  }, [endedElsewhere, records, session, chainId, account])

  const toOverview = useCallback(() => navigate(WEB_ROUTES.socialRecoveryManage), [navigate])
  const word = t(`${REMOVE}.word`)
  const confirmed = typed === word

  const keep = (
    <Button
      testID="manage-remove-keep"
      type="outline"
      text={t(`${REMOVE}.keep`)}
      onPress={toOverview}
      hasBottomSpacing={false}
    />
  )
  const lookingUp =
    held.status === 'pending' ||
    state.lookup === 'reading' ||
    (!steps && accountFacts.status === 'loading')
  const arrives = screen === 'arrival' || screen === 'held-by-another-write'

  if (
    screen === 'saved' ||
    screen === 'already-set-up' ||
    (screen === 'disagreed' && check.status === 'removed')
  ) {
    return <RemoveDone endedElsewhere={endedElsewhere} onClose={toOverview} />
  }

  return (
    <View testID="manage-remove">
      <PageTitle title={t(`${REMOVE}.title`)} titleTestID="manage-remove-title" />
      <Alert
        testID="manage-remove-warning"
        type="warning"
        size="sm"
        style={spacings.mbSm}
        text={t(`${REMOVE}.warning`)}
      />
      <ReadsGate
        reads={reads}
        needsPath={false}
        onControlMoved={arrives && held.status === 'none' ? toOverview : undefined}
        testID="manage-remove-reads"
      >
        {screen === 'disagreed' && check.status === 'failed' && (
          <ReadFailedBlock
            testID="manage-remove-check-failed"
            title={t(`${OVERVIEW}.reads.failedTitle`)}
            body={t(`${OVERVIEW}.reads.failedBody`)}
            onRetry={check.reread}
          />
        )}
        {screen === 'disagreed' && check.status !== 'failed' && (
          <RemoveDisagreed
            reading={check.status === 'reading'}
            onReadAgain={check.reread}
            onOverview={toOverview}
          />
        )}
        {screen === 'unread' && (
          <ReadFailedBlock
            testID="manage-remove-check-failed"
            title={t(`${OVERVIEW}.reads.failedTitle`)}
            body={t(`${OVERVIEW}.reads.failedBody`)}
            onRetry={run.reread}
          />
        )}
        {(arrives || screen === 'run' || screen === 'confirming') && (
          <RemoveArrival
            heldFailed={held.status === 'failed'}
            onRetryHeld={retryHeld}
            lookingUp={lookingUp}
            word={word}
            typed={typed}
            onType={setTyped}
            facts={ready}
            attemptOpen={attemptOpen}
            canRemove={confirmed && !!steps && state.lookup === 'none'}
            lookupFailed={state.lookup === 'failed'}
            onRemove={run.start}
            onLookAgain={run.lookAgain}
            keep={keep}
            run={
              screen === 'run' ? (
                <RemoveRun run={run} attemptOpen={attemptOpen} keep={keep} />
              ) : screen === 'confirming' ? (
                <ConfirmingBlock
                  transactionHash={
                    state.write.status === 'landed' ? state.write.transactionHash : undefined
                  }
                  testID="manage-remove-confirming"
                />
              ) : undefined
            }
          />
        )}
      </ReadsGate>
    </View>
  )
}

const RemoveScreen = () => {
  const { navigate } = useNavigation()
  const { account } = useSetupAccount()
  const records = useMemo(() => createWalletRecords({ storage: extensionRecordStorage }), [])
  const chainId = CHAIN_IDS[WALLET_RECOVERY_CHAIN]
  const session = useMemo(
    () => (account ? editSessionOf(extensionRecordStorage, chainId, account) : null),
    [account, chainId]
  )

  return (
    <SetupChrome testID="manage-remove-screen">
      {!!account && !!session && (
        <RemoveStageView
          key={`${chainId}:${account}`}
          records={records}
          session={session}
          chainId={chainId}
          account={account}
          navigate={navigate}
        />
      )}
    </SetupChrome>
  )
}

export default React.memo(RemoveScreen)
