/**
 * The wait's route: the account from the search, its recovery entry record
 * for the route and the receiving account, the countdown's record, the chrome
 * by route, and the wait with the page's own helpers: the recovery client of
 * the account being recovered, the handover's two keys, the setup this device
 * holds, the sending key by route and the send port over the request queue.
 * A search with no account opens the wait of the one landed session this
 * device holds; with none or several it goes to the account step with no
 * search, as does an account with no entry record, which sends the holder on
 * to the recovery entry's first step. No countdown: a live or wiped session goes to the
 * checklist, none to the route's entry. A consumed attempt goes on to the
 * done screen. A run that finds the countdown names another attempt is let go,
 * and the countdown's record is read again.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Linking, View } from 'react-native'
import { useLocation } from 'react-router-dom'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import { useTranslation } from '@common/config/localization'
import useNavigation from '@common/hooks/useNavigation'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'
import useRequestsControllerState from '@web/hooks/useRequestsControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import type { Configuration, Hex } from '@kohaku-eth/social-recovery'
import EntryReadFallback from '@web/modules/social-recovery/shared/chrome/EntryReadFallback'
import RecoveryChrome from '@web/modules/social-recovery/shared/chrome/RecoveryChrome'
import useRecoveryEntryRead from '@web/modules/social-recovery/shared/chrome/useRecoveryEntryRead'
import {
  addressBookOf,
  CHAIN_IDS,
  createSendPort,
  seedBasicAccountOf,
  sendRequestPort,
  WALLET_RECOVERY_CHAIN
} from '@web/modules/social-recovery/shared/client'
import type { HeldRequestQueue, ListedAccount } from '@web/modules/social-recovery/shared/client'
import { useAccountFacts } from '@web/modules/social-recovery/shared/client/useAccountFacts'
import { useRecoveryClient } from '@web/modules/social-recovery/shared/client/useRecoveryClient'
import {
  countdownOfDeployment,
  createWalletRecords,
  extensionRecordStorage,
  isOfDeployment,
  isSessionOfDeployment,
  readRecoveryPassword
} from '@web/modules/social-recovery/shared/records'
import {
  accountStepPath,
  checklistPathOf,
  configurationOf,
  parseChecklistSearch,
  routeEntryPathOf,
  waitPathOf
} from '@web/modules/social-recovery/recovery/checklist'
import { CHAIN_NAMES } from '@web/modules/social-recovery/recovery/entry'
import { loggedInPlanOf } from '@web/modules/social-recovery/recovery/submit'
import type { SendingReading } from '@web/modules/social-recovery/recovery/submit'
import { explorerTransactionUrlOf } from '@web/modules/social-recovery/setup/arm'

import { WAIT_STAGE } from './constants'
import { anchorOf, donePathOf } from './phase'
import { isCountdownOf, landedAttemptOf, waitNewKeyOf } from './read'
import { executeStepsOf } from './steps'
import type {
  CountdownReading,
  ExecuteSteps,
  HandoverKeysReading,
  LeaveState,
  RemovedKeyReading,
  WaitBodyProps,
  WaitClient,
  WaitGateProps
} from './types'
import useCountdownClock from './useCountdownClock'
import useExecuteRun from './useExecuteRun'
import useWaitPoll from './useWaitPoll'
import WaitView from './WaitView'

const CHAIN_ID = CHAIN_IDS[WALLET_RECOVERY_CHAIN]

const WaitBody = ({
  records,
  account,
  entry,
  savedAt,
  landed,
  onCountdownReplaced
}: WaitBodyProps) => {
  const { navigate } = useNavigation()
  const { accounts } = useAccountsControllerState()
  const { keys: keystoreKeys } = useKeystoreControllerState()
  const { dispatch, windowId } = useBackgroundService()
  const queue = useRequestsControllerState()
  const { account: selectedAccount } = useSelectedAccountControllerState()
  const clientState = useRecoveryClient(account)
  const facts = useAccountFacts(entry.receivingAccount)
  const ownFacts = useAccountFacts(account)
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])

  const kit = clientState.status === 'ready' ? clientState.client : null
  const chainReads = clientState.status === 'ready' ? clientState.reads : null
  const receipts = clientState.status === 'ready' ? clientState.receipts : null
  const client = useMemo<WaitClient>(() => {
    if (kit && chainReads && receipts) {
      return { status: 'ready', client: kit, reads: chainReads, receipts }
    }
    if (clientState.status === 'update-the-wallet') {
      return { status: 'update-the-wallet' }
    }
    if (clientState.status === 'failed') {
      return { status: 'failed' }
    }
    return { status: 'loading' }
  }, [kit, chainReads, receipts, clientState.status])

  // The key the recovery removes, as this wallet read it once for this page.
  const [removed, setRemoved] = useState<RemovedKeyReading>({ status: 'loading' })
  const [removedAttempt, setRemovedAttempt] = useState(0)
  useEffect(() => {
    if (!kit) {
      return undefined
    }
    let live = true
    setRemoved({ status: 'loading' })
    kit.walletReads
      .removedKey()
      .then((reading) => {
        if (live) {
          setRemoved({ status: 'named', key: reading.kind === 'named' ? reading.key : null })
        }
      })
      .catch(() => {
        if (live) {
          setRemoved({ status: 'failed' })
        }
      })
    return () => {
      live = false
    }
  }, [kit, removedAttempt])

  const receivingFacts = facts.status === 'ready' ? facts.facts : null
  const newKey = receivingFacts ? waitNewKeyOf(receivingFacts) : null
  // The new key comes from the wallet's facts of the account, so facts that
  // could not be read, whatever the cause, leave the keys unread with their
  // retry; the sending line below reads only once the keys are known.
  const keys = useMemo<HandoverKeysReading>(() => {
    if (removed.status === 'failed' || facts.status === 'unavailable') {
      return { status: 'failed' }
    }
    if (removed.status !== 'named' || facts.status === 'loading') {
      return { status: 'loading' }
    }
    if (!newKey) {
      return { status: 'failed' }
    }
    return { status: 'ready', keys: { newKey, removedKey: removed.key } }
  }, [removed, facts.status, newKey])
  const handover = keys.status === 'ready' ? keys.keys : null

  // The setup this device holds, for the path line and the cancel's threshold.
  const [configuration, setConfiguration] = useState<Configuration | null>(null)
  useEffect(() => {
    if (!kit) {
      return undefined
    }
    let live = true
    configurationOf({
      records,
      chainId: CHAIN_ID,
      account,
      client: kit,
      password: readRecoveryPassword(CHAIN_ID, account)
    })
      .then((reading) => {
        if (live) {
          setConfiguration(reading.kind === 'configuration' ? reading.configuration : null)
        }
      })
      .catch(() => {
        if (live) {
          setConfiguration(null)
        }
      })
    return () => {
      live = false
    }
  }, [kit, records, account])

  const { poll, retry: retryPoll } = useWaitPoll({
    kit,
    keys: handover,
    landed,
    visibility: document
  })
  const answered = poll.status === 'answered' ? poll : null
  const anchor = useMemo(() => (answered ? anchorOf(answered) : null), [answered])
  const remainingMs = useCountdownClock(anchor)

  // The countdown that reaches its end asks the chain at once, so execution due needs no wait for the period.
  const dueAsked = useRef<number | null>(null)
  useEffect(() => {
    if (
      answered?.phase.kind === 'waiting' &&
      remainingMs !== null &&
      remainingMs <= 0 &&
      dueAsked.current !== answered.round
    ) {
      dueAsked.current = answered.round
      retryPoll()
    }
  }, [answered, remainingMs, retryPoll])

  const sending = useMemo<SendingReading>(() => {
    if (facts.status === 'loading') {
      return { status: 'loading' }
    }
    if (!receivingFacts) {
      // Facts that could not be read show as the keys' failure above this line.
      return { status: 'loading' }
    }
    const network = {
      name: receivingFacts.network.name,
      nativeAssetSymbol: receivingFacts.network.nativeAssetSymbol
    }
    if (entry.route === 'logged-in') {
      const plan = loggedInPlanOf(receivingFacts, entry.receivingAccount)
      return plan ? { status: 'ready', plan, network } : { status: 'unavailable' }
    }
    if (!accounts || !keystoreKeys) {
      return { status: 'loading' }
    }
    const key = seedBasicAccountOf(entry.receivingAccount, accounts, keystoreKeys)
    return key
      ? { status: 'ready', plan: { kind: 'key', key: { addr: key, type: 'internal' } }, network }
      : { status: 'unavailable' }
  }, [facts.status, receivingFacts, entry, accounts, keystoreKeys])

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
  const port = useMemo(
    () => createSendPort(requests, { chainId: CHAIN_ID, visibility: document }),
    [requests]
  )

  const due = answered?.phase.kind === 'executionDue' ? answered.phase.attempt : null
  const payload = answered?.story.started?.payload ?? null
  const plan = sending.status === 'ready' ? sending.plan : null
  const network = sending.status === 'ready' ? sending.network : null
  const now = useCallback(() => Date.now(), [])
  const steps = useMemo<ExecuteSteps | null>(() => {
    if (!kit || !chainReads || !receipts || !landed || !due || !payload || !plan || !network) {
      return null
    }
    return executeStepsOf({
      records,
      chainId: CHAIN_ID,
      account,
      landed,
      client: kit,
      reads: chainReads,
      receipts,
      port,
      requests,
      plan,
      network,
      attempt: due,
      payload,
      now
    })
  }, [
    kit,
    chainReads,
    receipts,
    landed,
    due,
    payload,
    plan,
    network,
    port,
    requests,
    now,
    records,
    account
  ])
  const run = useExecuteRun(
    steps,
    `${CHAIN_ID}:${account.toLowerCase()}:${landed ? landed.attemptId.toString() : ''}`
  )

  // A landed execution is read back at once; a send the attempt read still
  // disagrees with has its receipt asked for again and is checked for a drop.
  const writeStatus = run.state.write.status
  useEffect(() => {
    if (writeStatus === 'landed') {
      retryPoll()
    }
  }, [writeStatus, retryPoll])
  const { checkDropped, checkReceiptAgain } = run
  useEffect(() => {
    if (answered && answered.phase.kind !== 'consumed' && writeStatus === 'submitting') {
      checkReceiptAgain()
      checkDropped()
    }
  }, [answered, writeStatus, checkReceiptAgain, checkDropped])

  const consumed = answered?.phase.kind === 'consumed'
  const releaseRun = useRef(run.release)
  releaseRun.current = run.release
  useEffect(() => {
    if (consumed) {
      releaseRun.current()
      navigate(donePathOf(account), { replace: true })
    }
  }, [consumed, navigate, account])

  const replaced = !!run.state.replaced
  useEffect(() => {
    if (replaced) {
      releaseRun.current()
      onCountdownReplaced()
    }
  }, [replaced, onCountdownReplaced])

  const [leave, setLeave] = useState<LeaveState>('idle')
  const onLeave = useCallback(() => {
    setLeave('leaving')
    // The countdown is read again first: an execution claim written since the open moved its revision.
    // A countdown that names another attempt than this screen's is left as it is, and read again.
    const leaveCountdown = async () => {
      const read = await records.countdown(CHAIN_ID, account).read()
      if (read.status === 'present') {
        const ours = landed
          ? isCountdownOf(read.value, landed)
          : landedAttemptOf(read.value) === null
        if (!ours) {
          onCountdownReplaced()
          return
        }
      }
      await records.endCountdown(
        CHAIN_ID,
        account,
        read.status === 'present' ? read.revision : null
      )
      await records.recoveryEntry(CHAIN_ID, account).clear()
      navigate(routeEntryPathOf(entry.route), { replace: true })
    }
    leaveCountdown().catch(() => setLeave('failed'))
  }, [records, account, navigate, entry.route, landed, onCountdownReplaced])

  const onBack = useCallback(() => navigate(routeEntryPathOf(entry.route)), [navigate, entry.route])

  const holdsAccountKey = ownFacts.status === 'ready' && !!ownFacts.facts.key
  // The transfer screen sends from the selected account, so the account being recovered is selected first.
  const listedAddress = ownFacts.status === 'ready' ? ownFacts.facts.account.addr : null
  const onMoveFunds = useCallback(() => {
    if (holdsAccountKey && listedAddress) {
      dispatch({ type: 'MAIN_CONTROLLER_SELECT_ACCOUNT', params: { accountAddr: listedAddress } })
      navigate(`/${WEB_ROUTES.transfer}`)
    }
  }, [holdsAccountKey, listedAddress, dispatch, navigate])

  const chain = kit?.chain
  const onOpenExplorer = useCallback(
    (transactionHash: Hex) => {
      if (chain) {
        Linking.openURL(explorerTransactionUrlOf(chain, transactionHash)).catch(() => undefined)
      }
    },
    [chain]
  )

  const retryClient = useCallback(() => {
    if (clientState.status === 'failed' || clientState.status === 'update-the-wallet') {
      clientState.retry()
    }
  }, [clientState])
  const retryKeys = useCallback(() => {
    facts.retry()
    setRemovedAttempt((n) => n + 1)
  }, [facts])

  return (
    <WaitView
      account={account}
      networkName={CHAIN_NAMES[WALLET_RECOVERY_CHAIN]}
      client={client}
      keys={keys}
      poll={poll}
      remainingMs={remainingMs}
      startedAt={savedAt}
      timeZone={timeZone}
      configuration={configuration}
      execute={run.state}
      sending={sending}
      holdsAccountKey={holdsAccountKey}
      leave={leave}
      onExecute={run.start}
      onRetryPoll={retryPoll}
      onRetryKeys={retryKeys}
      onRetryClient={retryClient}
      onLeave={onLeave}
      onBack={onBack}
      onMoveFunds={onMoveFunds}
      onOpenExplorer={onOpenExplorer}
    />
  )
}

/** The countdown's record of the account, or where the holder goes without one. */
const WaitGate = ({ records, account, entry }: WaitGateProps) => {
  const { t } = useTranslation()
  const { navigate } = useNavigation()
  const [reading, setReading] = useState<CountdownReading>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const readAgain = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    let live = true
    setReading({ status: 'loading' })
    const read = async () => {
      // A countdown or a session of another deployment is no recovery of this build.
      const build = addressBookOf(WALLET_RECOVERY_CHAIN)
      const countdown = countdownOfDeployment(
        await records.countdown(CHAIN_ID, account).read(),
        build
      )
      if (!live) {
        return
      }
      if (countdown.status === 'present') {
        setReading({
          status: 'present',
          savedAt: countdown.savedAt,
          landed: landedAttemptOf(countdown.value)
        })
        return
      }
      const session = await records.recoverySession(CHAIN_ID, account).read()
      if (!live) {
        return
      }
      navigate(
        session.status === 'present' && isSessionOfDeployment(session.value, build)
          ? checklistPathOf(account)
          : routeEntryPathOf(entry.route),
        { replace: true }
      )
    }
    read().catch(() => {
      if (live) {
        setReading({ status: 'failed' })
      }
    })
    return () => {
      live = false
    }
  }, [records, account, entry.route, navigate, attempt])

  if (reading.status === 'present') {
    return (
      <WaitBody
        records={records}
        account={account}
        entry={entry}
        savedAt={reading.savedAt}
        landed={reading.landed}
        onCountdownReplaced={readAgain}
      />
    )
  }
  if (reading.status === 'failed') {
    return (
      <Alert
        testID="wait-countdown-failed"
        type="error"
        size="sm"
        title={t('socialRecovery.wait.readFailedTitle')}
        text={t('socialRecovery.wait.readFailedBody')}
      >
        <View style={spacings.mtTy}>
          <Button
            testID="wait-countdown-retry"
            type="secondary"
            size="small"
            text={t('socialRecovery.writes.tryAgain')}
            onPress={readAgain}
            hasBottomSpacing={false}
          />
        </View>
      </Alert>
    )
  }
  return <ActivityIndicator testID="wait-countdown-loading" />
}

const WaitScreen = () => {
  const { navigate } = useNavigation()
  const location = useLocation()
  const search = useMemo(() => parseChecklistSearch(location.search), [location.search])
  const records = useMemo(() => createWalletRecords({ storage: extensionRecordStorage }), [])
  const account = search?.account
  // Moves on with each account in the search and on unmount, so a listing that
  // answers after either sends the holder nowhere.
  const generation = useRef(0)
  useEffect(() => {
    generation.current += 1
    return () => {
      generation.current += 1
    }
  }, [account])
  const onAbsent = useCallback(() => {
    const started = generation.current
    const toAccountStep = () => {
      if (generation.current === started) {
        navigate(accountStepPath(), { replace: true })
      }
    }
    if (account) {
      toAccountStep()
      return
    }
    records.listCountdowns(CHAIN_ID).then((listed) => {
      const build = addressBookOf(WALLET_RECOVERY_CHAIN)
      const landed = listed.filter(({ record }) => isOfDeployment(record.value.deployment, build))
      if (landed.length !== 1) {
        toAccountStep()
      } else if (generation.current === started) {
        navigate(waitPathOf(landed[0].account), { replace: true })
      }
    }, toAccountStep)
  }, [account, records, navigate])
  const { reading, retry } = useRecoveryEntryRead(records, CHAIN_ID, account, onAbsent)

  if (reading.status === 'present' && account) {
    return (
      <RecoveryChrome
        route={reading.entry.route}
        titleKey="socialRecovery.routes.recovery"
        stage={{ step: WAIT_STAGE, testID: 'wait-stage' }}
        testID="wait-screen"
      >
        <WaitGate key={account} records={records} account={account} entry={reading.entry} />
      </RecoveryChrome>
    )
  }

  return (
    <EntryReadFallback
      testPrefix="wait"
      titleKey="socialRecovery.wait.readFailedTitle"
      bodyKey="socialRecovery.wait.readFailedBody"
      failed={reading.status === 'failed'}
      onRetry={retry}
    />
  )
}

export default React.memo(WaitScreen)
