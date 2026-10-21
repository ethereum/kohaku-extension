/**
 * The review of changes before the one transaction the account's key signs:
 * what the edit changes against the configuration it started from, the
 * stale card line, the new path with its rule lines, what a recovery
 * publishes, the trust list of the rows the edit adds under its expander, the
 * account the save writes to, and the save behind the setup review's own
 * gate, which waits for every trust read, plus the edit's own: nothing
 * changed holds it with its line, and so does a setup the account no longer
 * authorizes while an attempt is open, since its commit would authorize it
 * again while that recovery runs. An added row this device never tested warns
 * beside the save. While an attempt is open on the account the line that
 * saving cancels it sits above the save; the save reads the attempt again
 * right before the send, and the line follows that read.
 *
 * The save runs here over the save's own run, in the shared states with the
 * edit's copy, and reads as saved only once the check after the landing
 * agreed and the records were wiped. A stored removal in flight sends the
 * holder to the removal, and another screen's stored write to the overview;
 * the stored write is read again whenever the tab comes back into view.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Linking, View } from 'react-native'

import Button from '@common/components/Button'
import { useTranslation } from '@common/config/localization'
import useNavigation from '@common/hooks/useNavigation'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import { useHeldKeys } from '@web/modules/social-recovery/management/overview/useHeldKeys'
import { useOverviewReads } from '@web/modules/social-recovery/management/overview/useOverviewReads'
import { PageTitle } from '@web/modules/social-recovery/shared/chrome'
import SetupChrome from '@web/modules/social-recovery/shared/chrome/SetupChrome'
import useSetupAccount from '@web/modules/social-recovery/shared/chrome/useSetupAccount'
import {
  addressBookOf,
  CHAIN_IDS,
  WALLET_RECOVERY_CHAIN
} from '@web/modules/social-recovery/shared/client'
import { useAccountFacts } from '@web/modules/social-recovery/shared/client/useAccountFacts'
import { useRecoveryClient } from '@web/modules/social-recovery/shared/client/useRecoveryClient'
import {
  createWalletRecords,
  extensionRecordStorage,
  readRecoveryPassword
} from '@web/modules/social-recovery/shared/records'
import {
  armScreenOf,
  cardPathOf,
  explorerTransactionUrlOf
} from '@web/modules/social-recovery/setup/arm'
import DisagreedView from '@web/modules/social-recovery/setup/arm/DisagreedView'
import { useArmRun } from '@web/modules/social-recovery/setup/arm/useArmRun'
import {
  CARD_FROM_KEY,
  CARD_FROM_MANAGE,
  levelOfBackup
} from '@web/modules/social-recovery/setup/card'
import { methodsOf, trustRowsOf } from '@web/modules/social-recovery/setup/review'
import { useAccountReads } from '@web/modules/social-recovery/setup/review/useAccountReads'
import { useTrustReads } from '@web/modules/social-recovery/setup/review/useTrustReads'

import { addedCredentialsOf, changesOf, makesCardStale, passwordChangedOf } from './changes'
import { REVIEW } from './constants'
import { ruleOfPath } from './copy'
import { addedTrustRowsOf } from './readings'
import ReadsGate from './ReadsGate'
import ReviewArrival from './ReviewArrival'
import ReviewRun from './ReviewRun'
import ReviewSaved from './ReviewSaved'
import ReviewSetupChanged from './ReviewSetupChanged'
import { editSessionOf, readNewPassword } from './session'
import { editStepsOf } from './steps'
import type { AttemptRead, EditStageProps, ReviewLoad } from './types'
import { useHeldWrite } from './useHeldWrite'
import { useWriteSeams } from './useWriteSeams'

export const ReviewStageView = ({
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
  const facts = reads.facts.status === 'answered' ? reads.facts.value : null
  // The attempt as the save last read it before the send; a new read of the overview's facts replaces it.
  const [attemptRead, setAttemptRead] = useState<AttemptRead | null>(null)
  useEffect(() => setAttemptRead(null), [reads.facts])
  const attemptOpen = attemptRead ? attemptRead.open : !!facts?.attemptOpen
  const dormantRefused = attemptRead
    ? attemptRead.dormant
    : !!facts && facts.attemptOpen && !facts.setup.isAuthorized
  // Read by the save before the send, which sends nothing over an attempt this screen did not show.
  const cancelLineShown = useRef(false)
  const lineShown = attemptOpen && !dormantRefused
  // Set once the screen with or without the line is committed, never from a render React may drop.
  useLayoutEffect(() => {
    cancelLineShown.current = lineShown
  }, [lineShown])
  const addressBook = useMemo(() => addressBookOf(WALLET_RECOVERY_CHAIN), [])
  const seams = useWriteSeams(chainId)
  const accountFacts = useAccountFacts(account)
  const { held, retry: retryHeld, refresh: refreshHeld } = useHeldWrite(records, chainId, account)
  const [load, setLoad] = useState<ReviewLoad>({ status: 'pending' })
  const [loadRound, setLoadRound] = useState(0)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (held.status === 'held' && held.write === 'manageRemove') {
      navigate(WEB_ROUTES.socialRecoveryManageRemove)
    }
    if (held.status === 'other') {
      navigate(WEB_ROUTES.socialRecoveryManage)
    }
  }, [held, navigate])

  useEffect(() => {
    let live = true
    setLoad({ status: 'pending' })
    const setup = records.setup(chainId, account)
    Promise.all([setup.setupDraft.read(), setup.enrollments.read(), session.read()]).then(
      ([draft, enrollments, baseline]) => {
        if (!live) {
          return
        }
        setLoad(
          draft.status === 'present' && baseline
            ? {
                status: 'loaded',
                draft: draft.value,
                enrollments: enrollments.status === 'present' ? enrollments.value : [],
                baseline
              }
            : { status: 'none' }
        )
      },
      () => {
        if (live) {
          setLoad({ status: 'failed' })
        }
      }
    )
    return () => {
      live = false
    }
  }, [records, session, chainId, account, loadRound])

  const loaded = load.status === 'loaded' ? load : null
  const draft = loaded?.draft ?? null
  const clauses = useMemo(() => draft?.clauses ?? [], [draft])
  const added = useMemo(
    () => (loaded ? addedCredentialsOf(loaded.baseline.configuration.clauses, clauses) : []),
    [loaded, clauses]
  )
  const methods = useMemo(
    () => methodsOf([{ threshold: 1, credentials: added }], addressBook),
    [added, addressBook]
  )
  const trust = useTrustReads(kit?.moduleReads ?? null, methods)
  const trustRows = useMemo(
    () =>
      addedTrustRowsOf(
        trustRowsOf({
          clauses,
          enrollments: loaded?.enrollments ?? [],
          reads: trust.reads,
          shippedMethods: kit?.descriptor.shippedMethods ?? [],
          addressBook
        }),
        added
      ),
    [clauses, loaded, trust.reads, kit, addressBook, added]
  )
  const accountReads = useAccountReads(kit, draft)

  const password = readRecoveryPassword(chainId, account)
  const newPassword = readNewPassword(chainId, account)
  const rows = useMemo(
    () =>
      loaded
        ? changesOf({
            baseline: loaded.baseline,
            draft: loaded.draft,
            passwordChanged: passwordChangedOf(
              loaded.baseline,
              loaded.draft,
              loaded.baseline.password
            ),
            ruleOf: ruleOfPath(addressBook, t)
          })
        : [],
    [loaded, addressBook, t]
  )
  const stale = makesCardStale(rows)

  const ready = accountFacts.status === 'ready' ? accountFacts.facts : null
  const ownWrite = held.status === 'none' || (held.status === 'held' && held.write === 'manageEdit')
  const steps = useMemo(() => {
    if (!ready?.key || !kit || !loaded || !ownWrite || clientState.status !== 'ready') {
      return null
    }
    return editStepsOf({
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
      baseline: loaded.baseline,
      draft: loaded.draft,
      password,
      newPassword,
      onAttempt: setAttemptRead,
      showsCancelLine: () => cancelLineShown.current
    })
  }, [
    ready,
    kit,
    loaded,
    ownWrite,
    clientState,
    seams,
    records,
    session,
    chainId,
    account,
    password,
    newPassword
  ])
  const run = useArmRun(steps, `manage:edit:${chainId}:${account.toLowerCase()}`)
  const { state } = run
  const screen = armScreenOf(state)
  const { write } = state

  // A run that read or lost its claim to another screen's write ends unsent, or stops for that
  // screen; the stored write is read again.
  useEffect(() => {
    if (
      state.lookup === 'failed' ||
      write.status === 'failedNotSent' ||
      state.stop === 'held-by-another-write'
    ) {
      refreshHeld()
    }
  }, [state.lookup, write.status, state.stop, refreshHeld])

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

  const openUrl = useCallback((url: string) => {
    Linking.openURL(url).catch(() => undefined)
  }, [])
  const toEditor = useCallback(() => navigate(WEB_ROUTES.socialRecoveryManageEdit), [navigate])
  const toOverview = useCallback(() => navigate(WEB_ROUTES.socialRecoveryManage), [navigate])

  const backToEditor = (
    <Button
      testID="manage-review-back"
      type="outline"
      text={t(`${REVIEW}.backToEditor`)}
      onPress={toEditor}
      hasBottomSpacing={false}
    />
  )

  const toExplorer = useCallback(() => {
    if (write.status === 'landed') {
      openUrl(explorerTransactionUrlOf(kit?.chain ?? WALLET_RECOVERY_CHAIN, write.transactionHash))
    }
  }, [write, kit, openUrl])
  const toCard = useCallback(() => {
    if (draft) {
      // The card opened from here stands outside the setup stages and leads back to the overview.
      navigate(
        `${cardPathOf(levelOfBackup(draft.privacy.backup))}&${CARD_FROM_KEY}=${CARD_FROM_MANAGE}`
      )
    }
  }, [draft, navigate])
  const retryLoad = useCallback(() => {
    retryHeld()
    setLoadRound((round) => round + 1)
  }, [retryHeld])
  const toggleExpanded = useCallback(() => setExpanded((open) => !open), [])
  const lookingUp = state.lookup === 'reading' || (!steps && accountFacts.status === 'loading')
  const arrives = screen === 'arrival' || screen === 'held-by-another-write'
  const landedOrUnseen = write.status === 'landed' || !!state.landedUnseen

  return (
    <View testID="manage-review">
      <PageTitle
        title={t(`${REVIEW}.title`)}
        lead={t(`${REVIEW}.lead`)}
        titleTestID="manage-review-title"
      />
      <ReadsGate
        reads={reads}
        needsPath={false}
        onControlMoved={arrives && held.status === 'none' ? toOverview : undefined}
        testID="manage-review-reads"
      >
        {screen === 'saved' && (
          <ReviewSaved
            transactionHash={write.status === 'landed' ? write.transactionHash : undefined}
            onExplorer={toExplorer}
            stale={stale}
            onDone={toOverview}
            onCard={stale && draft ? toCard : undefined}
          />
        )}
        {screen === 'already-set-up' && <ReviewSetupChanged backToEditor={backToEditor} />}
        {(screen === 'disagreed' || screen === 'unread') && landedOrUnseen && (
          <DisagreedView
            transactionHash={write.status === 'landed' ? write.transactionHash : undefined}
            chain={kit?.chain ?? WALLET_RECOVERY_CHAIN}
            check={state.after.stage === 'disagreed' ? state.after.check : undefined}
            onReread={run.reread}
            navigate={navigate}
            openUrl={openUrl}
          />
        )}
        {screen === 'confirming' && <ActivityIndicator testID="manage-review-confirming" />}
        {screen === 'run' && (
          <ReviewRun
            run={run}
            attemptOpen={attemptOpen}
            dormantRefused={dormantRefused}
            backToEditor={backToEditor}
          />
        )}
        {arrives && (
          <ReviewArrival
            held={held}
            load={load}
            onRetryLoad={retryLoad}
            rows={rows}
            stale={stale}
            added={added}
            trustRows={trustRows}
            trust={trust}
            accountReads={accountReads}
            addressBook={addressBook}
            client={kit}
            account={account}
            password={password}
            newPassword={newPassword}
            expanded={expanded}
            onToggleExpanded={toggleExpanded}
            attemptOpen={attemptOpen}
            dormantRefused={dormantRefused}
            facts={ready}
            lookingUp={lookingUp}
            runReady={!!steps && state.lookup === 'none' && !state.stop}
            lookupFailed={state.lookup === 'failed'}
            onSave={run.start}
            onLookAgain={run.lookAgain}
            onEditor={toEditor}
            onOverview={toOverview}
            backToEditor={backToEditor}
          />
        )}
      </ReadsGate>
    </View>
  )
}

const ReviewScreen = () => {
  const { navigate } = useNavigation()
  const { account } = useSetupAccount()
  const records = useMemo(() => createWalletRecords({ storage: extensionRecordStorage }), [])
  const chainId = CHAIN_IDS[WALLET_RECOVERY_CHAIN]
  const session = useMemo(
    () => (account ? editSessionOf(extensionRecordStorage, chainId, account) : null),
    [account, chainId]
  )

  return (
    <SetupChrome testID="manage-review-screen">
      {!!account && !!session && (
        <ReviewStageView
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

export default React.memo(ReviewScreen)
