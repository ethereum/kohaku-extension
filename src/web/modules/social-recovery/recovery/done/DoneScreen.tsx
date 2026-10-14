/**
 * The done screen's route: the account from the search, its recovery entry
 * record for the route and the receiving account, the chrome by route, and
 * the screen with its helpers: the recovery client of the recovered account
 * and the consume event read through it, the block time read on the
 * extension's own provider, the setup this device holds, the add of the
 * recovered account to this wallet, and the last act.
 *
 * A search with no account goes to the account step. The countdown's record
 * is read once, before the last act ends it: while it names the attempt this
 * device landed, the consume is matched against that attempt; a record that
 * does not name it renders failed with retry, never another attempt's keys.
 * No entry record, as after the last act: where the wallet lists the account
 * the screen renders from the consume event alone with no line by route,
 * otherwise the account step. With no countdown nothing names this device's
 * attempt, so the screen adds nothing: it renders only where the wallet
 * already lists the account with the granted key, otherwise it goes to the
 * wait where the entry record is still there and to the account step where
 * it is not, since this device may never have landed the recovery. A read
 * that found no consume goes back to the wait; a read of the countdown or the
 * setup that fails renders failed with retry, never as a path this device
 * does not hold. The last act reads the account's recovery session once,
 * within its limit, and ends the countdown only where it still names the
 * attempt this screen matched, then clears the entry record and the recovery
 * password held in memory, and keeps the decrypted setup cache as this
 * device's cache of the setup; a countdown of another attempt, or one stored
 * since the screen found none, stays with its entry and its password, and the
 * screen leaves; a live session belongs to a new recovery of the account, so
 * its entry and password stay; a read that does not answer clears nothing
 * either. Edit selects the recovered account and opens the editor once the
 * wallet reports it selected.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { useLocation } from 'react-router-dom'
import { isAddressEqual } from 'viem'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import { useTranslation } from '@common/config/localization'
import useNavigation from '@common/hooks/useNavigation'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import type { Address, Configuration } from '@web/modules/social-recovery/sdk-interfaces'
import RecoveryChrome from '@web/modules/social-recovery/shared/chrome/RecoveryChrome'
import {
  addressBookOf,
  CHAIN_IDS,
  createProviderAdapter,
  extensionProviderFor,
  networkOf,
  WALLET_RECOVERY_CHAIN,
  within
} from '@web/modules/social-recovery/shared/client'
import { useRecoveryClient } from '@web/modules/social-recovery/shared/client/useRecoveryClient'
import { renderShortAddress } from '@web/modules/social-recovery/shared/display'
import {
  createWalletRecords,
  extensionRecordStorage,
  readRecoveryPassword,
  wipeRecoveryPassword
} from '@web/modules/social-recovery/shared/records'
import {
  accountStepPath,
  configurationOf,
  parseChecklistSearch,
  waitPathOf
} from '@web/modules/social-recovery/recovery/checklist'
import { POLL_LIMIT_MS } from '@web/modules/social-recovery/recovery/checklist/constants'
import { landedAttemptOf } from '@web/modules/social-recovery/recovery/wait'

import { listsWithKey } from './account'
import DoneView from './DoneView'
import { consumeMatchOf, sameLanded } from './read'
import { summaryOf } from './summary'
import type {
  BlockTimeRead,
  ConsumeMatch,
  DoneBodyProps,
  DoneEntryReading,
  DoneRead,
  FinishState,
  LocalRead
} from './types'
import useConsumeRead from './useConsumeRead'
import useRecoveredAccountAdd from './useRecoveredAccountAdd'

const CHAIN_ID = CHAIN_IDS[WALLET_RECOVERY_CHAIN]

const PENDING = { status: 'pending' } as const

const DoneBody = ({ records, account, entry }: DoneBodyProps) => {
  const { navigate } = useNavigation()
  const { dispatch } = useBackgroundService()
  const { accounts } = useAccountsControllerState()
  const { networks } = useNetworksControllerState()
  const { account: selected } = useSelectedAccountControllerState()
  const clientState = useRecoveryClient(account)
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  const addressBook = useMemo(() => addressBookOf(WALLET_RECOVERY_CHAIN), [])
  const route = entry?.route ?? null

  const kit = clientState.status === 'ready' ? clientState.client : null

  // A block's time by its number, on the extension's own provider for the recovery chain.
  const network = networkOf(networks, WALLET_RECOVERY_CHAIN)
  const networkRef = useRef(network)
  networkRef.current = network
  const hasNetwork = !!network
  const blockTime = useMemo<BlockTimeRead | null>(() => {
    if (!hasNetwork) {
      return null
    }
    return async (blockNumber: number) => {
      const current = networkRef.current
      if (!current) {
        throw new Error('The extension holds no network for the recovery chain.')
      }
      const provider = extensionProviderFor(current)
      try {
        return (await createProviderAdapter(provider).block(blockNumber)).timestamp
      } finally {
        provider.destroy()
      }
    }
  }, [hasNetwork])

  // The attempt this device landed, read before the last act ends the countdown.
  const [localAttempt, setLocalAttempt] = useState(0)
  const [landedRead, setLandedRead] = useState<LocalRead<ConsumeMatch>>(PENDING)
  useEffect(() => {
    let live = true
    setLandedRead(PENDING)
    records
      .countdown(CHAIN_ID, account)
      .read()
      .then((read) => {
        if (live) {
          const match = consumeMatchOf(read)
          setLandedRead(match ? { status: 'answered', value: match } : { status: 'failed' })
        }
      })
      .catch(() => {
        if (live) {
          setLandedRead({ status: 'failed' })
        }
      })
    return () => {
      live = false
    }
  }, [records, account, localAttempt])
  const match = landedRead.status === 'answered' ? landedRead.value : null

  const { read: consumeRead, retry: retryRead } = useConsumeRead({ kit, match, blockTime })
  const event =
    consumeRead.status === 'answered' && consumeRead.reading.kind === 'found'
      ? consumeRead.reading.event
      : null

  const none = consumeRead.status === 'answered' && consumeRead.reading.kind === 'none'
  useEffect(() => {
    if (none) {
      navigate(waitPathOf(account), { replace: true })
    }
  }, [none, navigate, account])

  // The setup this device holds.
  const [configuration, setConfiguration] = useState<LocalRead<Configuration | null>>(PENDING)
  useEffect(() => {
    if (!kit) {
      return undefined
    }
    let live = true
    setConfiguration(PENDING)
    within(
      () =>
        configurationOf({
          records,
          chainId: CHAIN_ID,
          account,
          client: kit,
          password: readRecoveryPassword(CHAIN_ID, account)
        }),
      POLL_LIMIT_MS
    )
      .then((reading) => {
        if (!live) {
          return
        }
        if (!reading) {
          setConfiguration({ status: 'failed' })
          return
        }
        setConfiguration({
          status: 'answered',
          value: reading.kind === 'configuration' ? reading.configuration : null
        })
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [kit, records, account, localAttempt])

  const summary = useMemo(() => {
    if (!event || configuration.status !== 'answered') {
      return null
    }
    return summaryOf({ configuration: configuration.value, addressBook, event })
  }, [event, configuration, addressBook])

  // No countdown: this device's last act ran, or it never landed this recovery, so nothing names its attempt.
  const recordsGone = match?.kind === 'ended'
  const { state: add, retry: retryAdd } = useRecoveredAccountAdd({
    completesSetup: route === 'fresh-install',
    dispatches: !recordsGone,
    chainId: CHAIN_ID,
    account,
    event
  })
  const notOurs =
    recordsGone && !!event && !!accounts && !listsWithKey(accounts, account, event.granted)
  const hasEntry = !!entry
  useEffect(() => {
    if (notOurs) {
      navigate(hasEntry ? waitPathOf(account) : accountStepPath(), { replace: true })
    }
  }, [notOurs, hasEntry, navigate, account])

  const listedAccount = accounts?.find((candidate) =>
    isAddressEqual(candidate.addr as Address, account)
  )
  const receiving = entry?.receivingAccount
  const receivingAccount = receiving
    ? accounts?.find((candidate) => isAddressEqual(candidate.addr as Address, receiving))
    : undefined
  const receivingName = receiving
    ? receivingAccount?.preferences.label || renderShortAddress(receiving)
    : null

  const countdownFailed = landedRead.status === 'failed'
  const localFailed = countdownFailed || configuration.status === 'failed'
  const read = useMemo<DoneRead>(() => {
    if (
      clientState.status === 'failed' ||
      clientState.status === 'update-the-wallet' ||
      countdownFailed
    ) {
      return { status: 'failed' }
    }
    if (consumeRead.status !== 'answered' || consumeRead.reading.kind === 'none') {
      return consumeRead
    }
    if (localFailed) {
      return { status: 'failed' }
    }
    return summary && !notOurs ? consumeRead : PENDING
  }, [clientState.status, countdownFailed, consumeRead, localFailed, summary, notOurs])
  const onRetryRead = useCallback(() => {
    if (clientState.status === 'failed' || clientState.status === 'update-the-wallet') {
      clientState.retry()
      return
    }
    if (consumeRead.status === 'failed') {
      retryRead()
    }
    if (localFailed) {
      setLocalAttempt((n) => n + 1)
    }
  }, [clientState, consumeRead.status, retryRead, localFailed])

  const [finish, setFinish] = useState<FinishState>('idle')
  const lastAct = useCallback(async () => {
    // The countdown and the session are one record, read once within its
    // limit: nothing can land between two reads, and a read that does not
    // answer clears nothing.
    const session = await within(
      () => records.recoverySession(CHAIN_ID, account).read(),
      POLL_LIMIT_MS
    )
    if (!session) {
      return
    }
    if (session.status === 'present' && session.value.state === 'landed') {
      const stored = landedAttemptOf(session.value)
      // A countdown of another attempt, landed since this screen read its own, belongs to that recovery.
      if (match?.kind !== 'landed' || !stored || !sameLanded(stored, match.landed)) {
        return
      }
      await records.endCountdown(CHAIN_ID, account, session.revision)
    } else if (session.status === 'present' && session.value.state === 'live') {
      // A live session is a new recovery of this account: its entry and password stay.
      return
    }
    await records.recoveryEntry(CHAIN_ID, account).clear()
    wipeRecoveryPassword(CHAIN_ID, account)
  }, [records, account, match])
  const leaveTo = useCallback(
    (next: () => void) => {
      setFinish('finishing')
      lastAct()
        .then(next)
        .catch(() => setFinish('failed'))
    },
    [lastAct]
  )
  const onClose = useCallback(
    () => leaveTo(() => navigate(`/${WEB_ROUTES.dashboard}`, { replace: true })),
    [leaveTo, navigate]
  )

  // The editor works on the selected account: it opens once the wallet reports the recovered one selected.
  const [toEditor, setToEditor] = useState(false)
  const selectedAddr = selected?.addr
  const isSelected = !!selectedAddr && isAddressEqual(selectedAddr as Address, account)
  useEffect(() => {
    if (toEditor && isSelected) {
      navigate(`/${WEB_ROUTES.socialRecoverySetupEditor}`)
    }
  }, [toEditor, isSelected, navigate])
  const onEdit = useCallback(
    () =>
      leaveTo(() => {
        dispatch({ type: 'MAIN_CONTROLLER_SELECT_ACCOUNT', params: { accountAddr: account } })
        setToEditor(true)
      }),
    [leaveTo, dispatch, account]
  )

  return (
    <DoneView
      account={account}
      accountName={listedAccount?.preferences.label || null}
      route={route}
      receivingName={receivingName}
      read={read}
      add={add}
      summary={summary}
      timeZone={timeZone}
      finish={finish}
      onRetryRead={onRetryRead}
      onRetryAdd={retryAdd}
      onClose={onClose}
      onEdit={onEdit}
    />
  )
}

const DoneScreen = () => {
  const { t } = useTranslation()
  const { navigate } = useNavigation()
  const location = useLocation()
  const { accounts } = useAccountsControllerState()
  const search = useMemo(() => parseChecklistSearch(location.search), [location.search])
  const records = useMemo(() => createWalletRecords({ storage: extensionRecordStorage }), [])
  const account = search?.account
  const [reading, setReading] = useState<DoneEntryReading>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const accountsRef = useRef(accounts)
  accountsRef.current = accounts
  const accountsReady = !!accounts
  // The entry read that answered: the wallet's accounts going and coming back do not read it again.
  const answered = useRef<string | null>(null)

  useEffect(() => {
    if (!account) {
      navigate(accountStepPath(), { replace: true })
      return undefined
    }
    const readKey = `${account}:${attempt}`
    if (!accountsReady || answered.current === readKey) {
      return undefined
    }
    let live = true
    setReading({ status: 'loading' })
    records
      .recoveryEntry(CHAIN_ID, account)
      .read()
      .then((read) => {
        if (!live) {
          return
        }
        answered.current = readKey
        if (read.status === 'present') {
          setReading({ status: 'present', entry: read.value })
          return
        }
        const listed = accountsRef.current?.some((candidate) =>
          isAddressEqual(candidate.addr as Address, account)
        )
        if (listed) {
          setReading({ status: 'present', entry: null })
          return
        }
        navigate(accountStepPath(), { replace: true })
      })
      .catch(() => {
        if (live) {
          answered.current = readKey
          setReading({ status: 'failed' })
        }
      })
    return () => {
      live = false
    }
  }, [records, account, accountsReady, attempt, navigate])

  if (reading.status === 'present' && account) {
    return (
      <RecoveryChrome
        route={reading.entry?.route ?? null}
        titleKey="socialRecovery.routes.recovery"
        testID="done-screen"
      >
        <DoneBody key={account} records={records} account={account} entry={reading.entry} />
      </RecoveryChrome>
    )
  }

  return (
    <RecoveryChrome route={null} titleKey="socialRecovery.routes.recovery" testID="done-screen">
      {reading.status === 'failed' ? (
        <Alert
          testID="done-entry-failed"
          type="error"
          size="sm"
          title={t('socialRecovery.done.readFailedTitle')}
          text={t('socialRecovery.done.readFailedBody')}
        >
          <View style={spacings.mtTy}>
            <Button
              testID="done-entry-retry"
              type="secondary"
              size="small"
              text={t('socialRecovery.writes.tryAgain')}
              onPress={() => setAttempt((n) => n + 1)}
              hasBottomSpacing={false}
            />
          </View>
        </Alert>
      ) : (
        <ActivityIndicator testID="done-entry-loading" />
      )}
    </RecoveryChrome>
  )
}

export default React.memo(DoneScreen)
