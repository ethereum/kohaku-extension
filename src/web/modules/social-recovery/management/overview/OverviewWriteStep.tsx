/**
 * The overview's own confirmation step for one of its writes, run as the save
 * runs: the re-authorize reads the committed level, asks the recovery
 * password where the level hides the setup and this tab holds none, shows the
 * trust list and keeps its action disabled until every party has rendered;
 * the clear carries its title and line, and the sentence that clearing ends
 * the recovery in progress while one is open; the removal of the
 * authorization runs from the warning's own action. The wallet's sign screen
 * is the one confirmation. The step shows the shared submitting and failed
 * states, and hands the overview back its chain read once the run ended where
 * the read decides, so the write never reads as done on this step's word.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Linking, View } from 'react-native'

import Button from '@common/components/Button'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useRequestsControllerState from '@web/hooks/useRequestsControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import { readSetupReading } from '@web/modules/social-recovery/recovery/entry/readout'
import { PageTitle } from '@web/modules/social-recovery/shared/chrome'
import {
  addressBookOf,
  createSendPort,
  sendRequestPort
} from '@web/modules/social-recovery/shared/client'
import type { HeldRequestQueue, ListedAccount } from '@web/modules/social-recovery/shared/client'
import { useAccountFacts } from '@web/modules/social-recovery/shared/client/useAccountFacts'
import { readRecoveryPassword } from '@web/modules/social-recovery/shared/records'
import { mayStillLand } from '@web/modules/social-recovery/shared/writes'
import { armScreenOf } from '@web/modules/social-recovery/setup/arm'
import DisagreedView from '@web/modules/social-recovery/setup/arm/DisagreedView'
import { useArmRun } from '@web/modules/social-recovery/setup/arm/useArmRun'
import {
  methodsOf,
  trustReadsComplete,
  trustRowsOf
} from '@web/modules/social-recovery/setup/review'
import { useTrustReads } from '@web/modules/social-recovery/setup/review/useTrustReads'

import { OVERVIEW, REMOVAL_DRAFT } from './constants'
import { overviewWriteKeysOf } from './copy'
import ReauthorizeArrival from './ReauthorizeArrival'
import { levelOfReading, needsPassword, reauthorizeDraftOf } from './readings'
import RunBlock from './RunBlock'
import type { LevelRead, OverviewIntent, OverviewWriteStepProps, StepHeadings } from './types'
import WriteStepArrival from './WriteStepArrival'
import WriteStepUnavailable from './WriteStepUnavailable'
import WriteStepUnread from './WriteStepUnread'
import { overviewStepsOf } from './writeSteps'

const HEADINGS: Record<OverviewIntent, StepHeadings> = {
  reauthorize: {
    title: `${OVERVIEW}.reauthorize.title`,
    lead: `${OVERVIEW}.reauthorize.lead`,
    action: `${OVERVIEW}.reauthorize.action`
  },
  clear: {
    title: `${OVERVIEW}.dormant.clearTitle`,
    lead: `${OVERVIEW}.dormant.clearBody`,
    action: `${OVERVIEW}.dormant.clear`
  },
  removeAuthorization: {
    title: `${OVERVIEW}.mirror.title`,
    lead: `${OVERVIEW}.mirror.body`,
    action: `${OVERVIEW}.mirror.action`
  }
}

const OverviewWriteStep = ({
  intent,
  client,
  chainReads,
  receipts,
  records,
  chainId,
  account,
  facts,
  reads,
  autoStart,
  onFinished,
  onLeft,
  onClose,
  navigate
}: OverviewWriteStepProps) => {
  const { t } = useTranslation()
  const { accounts } = useAccountsControllerState()
  const { dispatch, windowId } = useBackgroundService()
  const queue = useRequestsControllerState()
  const { account: selectedAccount } = useSelectedAccountControllerState()
  const accountFacts = useAccountFacts(account)
  const reauthorize = intent === 'reauthorize'

  const accountsRef = useRef<readonly ListedAccount[] | undefined>(accounts)
  accountsRef.current = accounts
  const queueRef = useRef<HeldRequestQueue | undefined>(queue)
  queueRef.current = queue
  const selectedRef = useRef<string | undefined>(selectedAccount?.addr)
  selectedRef.current = selectedAccount?.addr
  const requests = useMemo(
    () =>
      sendRequestPort(
        dispatch,
        () => accountsRef.current,
        () => queueRef.current,
        () => selectedRef.current,
        windowId
      ),
    [dispatch, windowId]
  )
  // A withdrawal a hidden tab could not send is sent again once the tab is shown.
  const port = useMemo(
    () => createSendPort(requests, { chainId, visibility: document }),
    [requests, chainId]
  )

  // The re-authorize commits the setup at the level it was committed at.
  const [level, setLevel] = useState<LevelRead>({ status: 'pending' })
  const [levelRound, setLevelRound] = useState(0)
  const retryLevel = useCallback(() => setLevelRound((round) => round + 1), [])
  useEffect(() => {
    if (!reauthorize) {
      return undefined
    }
    setLevel({ status: 'pending' })
    let live = true
    readSetupReading(client, facts.setup).then(
      (reading) => {
        if (!live) {
          return
        }
        const read = levelOfReading(reading)
        setLevel(read ? { status: 'answered', value: read } : { status: 'unreadable' })
      },
      () => {
        if (live) {
          setLevel({ status: 'failed' })
        }
      }
    )
    return () => {
      live = false
    }
  }, [reauthorize, client, facts.setup, levelRound])

  const configuration = reads.path.kind === 'readable' ? reads.path.configuration : null
  // The password lives in memory, outside React: a successful unlock moves the ask and renders again.
  const password = readRecoveryPassword(chainId, account)
  const passwordMissing =
    reauthorize &&
    level.status === 'answered' &&
    needsPassword(level.value) &&
    password === undefined
  const draft = useMemo(
    () =>
      reauthorize && configuration && level.status === 'answered'
        ? reauthorizeDraftOf(configuration, level.value)
        : null,
    [reauthorize, configuration, level]
  )

  const addressBook = useMemo(() => addressBookOf(client.chain), [client.chain])
  const clauses = useMemo(() => configuration?.clauses ?? [], [configuration])
  const methods = useMemo(
    () => (reauthorize ? methodsOf(clauses, addressBook) : []),
    [reauthorize, clauses, addressBook]
  )
  const trust = useTrustReads(reauthorize ? client.moduleReads : null, methods)
  const rows = useMemo(
    () =>
      trustRowsOf({
        clauses,
        enrollments: [],
        reads: trust.reads,
        shippedMethods: client.descriptor.shippedMethods,
        addressBook
      }),
    [clauses, trust.reads, client, addressBook]
  )

  // A re-authorize the wallet refused at its prepare, an attempt being open, hands back
  // once its run ended there, so the run is dropped with the step and none is kept.
  const [refusedAtPrepare, setRefusedAtPrepare] = useState(false)
  const onAttemptOpen = useCallback(() => setRefusedAtPrepare(true), [])

  const ready = accountFacts.status === 'ready' ? accountFacts.facts : null
  // The steps also follow a write stored on this device before the draft is known; a new
  // re-authorize starts only once its draft and its password are held.
  const steps = useMemo(() => {
    if (!ready?.key) {
      return null
    }
    return overviewStepsOf({
      intent,
      client,
      reads: chainReads,
      receipts,
      port,
      requests,
      records,
      chainId,
      account,
      facts: ready,
      key: ready.key,
      draft: draft ?? REMOVAL_DRAFT,
      password,
      onAttemptOpen
    })
  }, [
    onAttemptOpen,
    ready,
    intent,
    client,
    chainReads,
    receipts,
    port,
    requests,
    records,
    chainId,
    account,
    draft,
    password
  ])

  // The re-authorize commits through the save's own prepare and gas check; a removal is another setup write.
  const run = useArmRun(
    steps,
    `overview:${intent}:${chainId}:${account.toLowerCase()}`,
    reauthorize ? 'save' : 'ownerWrite'
  )
  const { state } = run
  const screen = armScreenOf(state)
  const { write } = state

  // A landed write whose check did not answer stays on its step with the check again.
  const finished =
    screen === 'saved' ||
    screen === 'already-set-up' ||
    (!reauthorize && screen === 'disagreed') ||
    (refusedAtPrepare && write.status === 'failedNotSent')
  useEffect(() => {
    if (finished) {
      onFinished()
    }
  }, [finished, onFinished])
  // A run that met a stored write of another write sent nothing; the overview points at its owner.
  const left = screen === 'held-by-another-write'
  useEffect(() => {
    if (left) {
      onLeft()
    }
  }, [left, onLeft])

  const canStart =
    steps !== null &&
    state.lookup === 'none' &&
    write.status === 'idle' &&
    !state.stop &&
    (!reauthorize || (!!draft && !passwordMissing && trustReadsComplete(rows)))

  const startWhenReady = useRef(autoStart)
  useEffect(() => {
    if (write.status !== 'idle') {
      startWhenReady.current = false
    } else if (canStart && startWhenReady.current) {
      startWhenReady.current = false
      run.start()
    }
  }, [canStart, write.status, run])

  const openUrl = useCallback((url: string) => {
    Linking.openURL(url).catch(() => undefined)
  }, [])

  const headings = HEADINGS[intent]
  const back = (
    <Button
      testID="overview-step-back"
      type="outline"
      text={t('socialRecovery.actions.back')}
      onPress={onClose}
      hasBottomSpacing={false}
    />
  )

  if (reauthorize && (screen === 'disagreed' || screen === 'unread')) {
    const landed = write.status === 'landed' || !!state.landedUnseen
    return landed ? (
      <DisagreedView
        transactionHash={write.status === 'landed' ? write.transactionHash : undefined}
        chain={client.chain}
        check={state.after.stage === 'disagreed' ? state.after.check : undefined}
        onReread={run.reread}
        navigate={navigate}
        openUrl={openUrl}
      />
    ) : null
  }

  const startAction = (
    <Button
      testID="overview-step-start"
      type="primary"
      text={t(headings.action)}
      disabled={!canStart}
      onPress={run.start}
      hasBottomSpacing={false}
    />
  )

  // Back wherever nothing is on its way to the chain.
  const stopped =
    !!state.dropped ||
    (write.status === 'failedNotSent' && !mayStillLand(write)) ||
    write.status === 'failedReverted' ||
    write.status === 'gasReadError' ||
    write.status === 'needsDeposit'

  return (
    <View testID={`overview-step-${intent}`}>
      <PageTitle
        title={t(headings.title)}
        lead={t(headings.lead)}
        titleTestID="overview-step-title"
      />
      <WriteStepUnavailable accountFacts={accountFacts} />
      {screen === 'arrival' && (
        <WriteStepArrival
          clearCancels={intent === 'clear' && facts.attemptOpen}
          reading={state.lookup === 'reading' || (!steps && accountFacts.status === 'loading')}
          lookupFailed={state.lookup === 'failed'}
          onLookAgain={run.lookAgain}
          startAction={startAction}
          back={back}
        >
          {reauthorize && (
            <ReauthorizeArrival
              reads={reads}
              level={level}
              onRetryLevel={retryLevel}
              passwordMissing={passwordMissing}
              rows={rows}
              client={client}
              onRetryTrust={trust.retry}
            />
          )}
        </WriteStepArrival>
      )}
      {screen === 'run' && (
        <RunBlock
          run={run}
          droppedLine={`${OVERVIEW}.writes.dropped`}
          keysOf={overviewWriteKeysOf}
          testID="overview-step"
        />
      )}
      {screen === 'confirming' && <ActivityIndicator testID="overview-step-confirming" />}
      {screen === 'unread' && <WriteStepUnread onReread={run.reread} />}
      {screen === 'run' && stopped && (
        <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mtSm]}>{back}</View>
      )}
    </View>
  )
}

export default React.memo(OverviewWriteStep)
