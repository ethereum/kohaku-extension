/**
 * The confirmation's route: the account from the search, its recovery entry
 * record for the route and the receiving account, the chrome by route, and
 * the confirmation with the page's own helpers: the recovery client of the
 * account being recovered, the key the recovery installs, the key it removes,
 * the sending key by route, the send port over the request queue and the
 * name the public name service resolves for the account. A search with no
 * account, or an account with no entry record, goes back to the account step.
 * A submission that landed goes on to the wait.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

import useNavigation from '@common/hooks/useNavigation'
import useReverseLookup from '@common/hooks/useReverseLookup/useReverseLookup'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'
import useRequestsControllerState from '@web/hooks/useRequestsControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import EntryReadFallback from '@web/modules/social-recovery/shared/chrome/EntryReadFallback'
import RecoveryChrome from '@web/modules/social-recovery/shared/chrome/RecoveryChrome'
import useRecoveryEntryRead from '@web/modules/social-recovery/shared/chrome/useRecoveryEntryRead'
import {
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
  createWalletRecords,
  extensionRecordStorage,
  readRecoveryPassword
} from '@web/modules/social-recovery/shared/records'
import {
  accountStepPath,
  checklistPathOf,
  destinationKeyOf,
  parseChecklistSearch,
  waitPathOf
} from '@web/modules/social-recovery/recovery/checklist'
import type { RemovedKeyRead } from '@web/modules/social-recovery/recovery/checklist'

import { SUBMIT_STAGE } from './constants'
import { isLanded } from './run'
import { loggedInPlanOf } from './sendingKey'
import { submitStepsOf } from './steps'
import SubmitView from './SubmitView'
import type { SendingReading, SubmitBodyProps, SubmitClient, SubmitSteps } from './types'
import useSubmitLoad from './useSubmitLoad'
import useSubmitRun from './useSubmitRun'
import useVerifyAgain from './useVerifyAgain'

const CHAIN_ID = CHAIN_IDS[WALLET_RECOVERY_CHAIN]

const SubmitBody = ({ records, account, entry }: SubmitBodyProps) => {
  const { navigate } = useNavigation()
  const { accounts } = useAccountsControllerState()
  const { keys } = useKeystoreControllerState()
  const { dispatch, windowId } = useBackgroundService()
  const queue = useRequestsControllerState()
  const { account: selectedAccount } = useSelectedAccountControllerState()
  const { ens } = useReverseLookup({ address: account })
  const clientState = useRecoveryClient(account)
  const facts = useAccountFacts(entry.receivingAccount)

  const kit = clientState.status === 'ready' ? clientState.client : null
  const chainReads = clientState.status === 'ready' ? clientState.reads : null
  const receipts = clientState.status === 'ready' ? clientState.receipts : null
  const client = useMemo<SubmitClient>(() => {
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

  const now = useCallback(() => Date.now(), [])
  const { load, retry: retryLoad } = useSubmitLoad({
    records,
    chainId: CHAIN_ID,
    account,
    client,
    navigate,
    readPassword: readRecoveryPassword,
    now
  })
  const ready = load.phase === 'ready' ? load : null
  const gathering = ready?.session.gathering ?? null
  const chosen = ready?.chosen ?? null
  const { verify, retry: retryVerify } = useVerifyAgain(kit, gathering, chosen)

  // The key the recovery removes, as this wallet reads it.
  const [removed, setRemoved] = useState<RemovedKeyRead>({ status: 'loading' })
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
          setRemoved(
            reading.kind === 'named'
              ? { status: 'named', key: reading.key }
              : { status: 'unavailable' }
          )
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
  // A wallet that does not list the account holds no key of it; the other
  // causes are reads that can run again.
  const notListed = facts.status === 'unavailable' && facts.cause === 'not-listed'
  const newKey = receivingFacts ? destinationKeyOf(receivingFacts) ?? undefined : undefined
  const sending = useMemo<SendingReading>(() => {
    if (facts.status === 'loading') {
      return { status: 'loading' }
    }
    if (!receivingFacts) {
      return notListed ? { status: 'unavailable' } : { status: 'failed' }
    }
    const network = {
      name: receivingFacts.network.name,
      nativeAssetSymbol: receivingFacts.network.nativeAssetSymbol
    }
    if (entry.route === 'logged-in') {
      const plan = loggedInPlanOf(receivingFacts, entry.receivingAccount)
      return plan ? { status: 'ready', plan, network } : { status: 'unavailable' }
    }
    if (!accounts || !keys) {
      return { status: 'loading' }
    }
    const key = seedBasicAccountOf(entry.receivingAccount, accounts, keys)
    return key
      ? { status: 'ready', plan: { kind: 'key', key: { addr: key, type: 'internal' } }, network }
      : { status: 'unavailable' }
  }, [facts.status, notListed, receivingFacts, entry, accounts, keys])

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
    () => createSendPort(requests, { chainId: CHAIN_ID, visibility: document }),
    [requests]
  )

  const plan = sending.status === 'ready' ? sending.plan : null
  const network = sending.status === 'ready' ? sending.network : null
  const steps = useMemo<SubmitSteps | null>(() => {
    if (!kit || !chainReads || !receipts || !gathering || !chosen || !plan || !network) {
      return null
    }
    return submitStepsOf({
      client: kit,
      reads: chainReads,
      receipts,
      port,
      requests,
      records,
      chainId: CHAIN_ID,
      account,
      gathering,
      plan,
      network,
      chosen,
      now
    })
  }, [
    kit,
    chainReads,
    receipts,
    gathering,
    chosen,
    plan,
    network,
    port,
    requests,
    records,
    account,
    now
  ])

  const run = useSubmitRun(steps, `${CHAIN_ID}:${account.toLowerCase()}`)
  const landed = isLanded(run.state)
  useEffect(() => {
    if (landed) {
      navigate(waitPathOf(account), { replace: true })
    }
  }, [landed, navigate, account])
  const toChecklist = !!run.state.toChecklist
  useEffect(() => {
    if (toChecklist) {
      navigate(checklistPathOf(account), { replace: true })
    }
  }, [toChecklist, navigate, account])

  const retryAll = useCallback(() => {
    if (clientState.status === 'failed' || clientState.status === 'update-the-wallet') {
      clientState.retry()
    }
    retryLoad()
  }, [clientState, retryLoad])

  return (
    <SubmitView
      route={entry.route}
      load={load}
      lead={{
        account,
        ...(ens ? { name: ens } : {}),
        ...(newKey ? { newKey } : {}),
        ...(receivingFacts?.account.preferences.label
          ? { receivingName: receivingFacts.account.preferences.label }
          : {}),
        removed
      }}
      verify={verify}
      run={run.state}
      sending={sending}
      onStart={run.start}
      onCheckAgain={run.checkAgain}
      onReread={run.reread}
      onRetryVerify={retryVerify}
      onRetryLoad={retryAll}
      onRetryRemoved={() => setRemovedAttempt((n) => n + 1)}
      onRetrySending={facts.retry}
      onBack={() => {
        run.leaveDeposit()
        navigate(checklistPathOf(account))
      }}
    />
  )
}

const SubmitScreen = () => {
  const { navigate } = useNavigation()
  const location = useLocation()
  const search = useMemo(() => parseChecklistSearch(location.search), [location.search])
  const records = useMemo(() => createWalletRecords({ storage: extensionRecordStorage }), [])
  const account = search?.account
  const toAccountStep = useCallback(
    () => navigate(accountStepPath(), { replace: true }),
    [navigate]
  )
  const { reading, retry } = useRecoveryEntryRead(records, CHAIN_ID, account, toAccountStep)

  if (reading.status === 'present' && account) {
    return (
      <RecoveryChrome
        route={reading.entry.route}
        titleKey="socialRecovery.routes.recovery"
        stage={{ step: SUBMIT_STAGE, testID: 'submit-stage' }}
        testID="submit-screen"
      >
        <SubmitBody key={account} records={records} account={account} entry={reading.entry} />
      </RecoveryChrome>
    )
  }

  return (
    <EntryReadFallback
      testPrefix="submit"
      titleKey="socialRecovery.wait.readFailedTitle"
      bodyKey="socialRecovery.client.unavailableBody"
      loadingKey="socialRecovery.loading.session"
      failed={reading.status === 'failed'}
      onRetry={retry}
    />
  )
}

export default React.memo(SubmitScreen)
