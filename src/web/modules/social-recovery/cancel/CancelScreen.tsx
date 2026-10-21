/**
 * The owner's cancel's route, in a full tab: the account from the search (a
 * missing or malformed one goes back to the dashboard), a fresh read of the
 * attempt through the watcher's poll, whose open attempt is the one offered,
 * the reads after a landing, the recovery client of the account, its facts and key, and
 * the send port over the request queue. "Done" and "Go back" return to the
 * dashboard; moving funds selects the account and opens the transfer screen.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

import useNavigation from '@common/hooks/useNavigation'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import useRequestsControllerState from '@web/hooks/useRequestsControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import type { Address } from '@kohaku-eth/social-recovery'
import RecoveryChrome from '@web/modules/social-recovery/shared/chrome/RecoveryChrome'
import {
  CHAIN_IDS,
  createSendPort,
  providerKeyOf,
  sendRequestPort,
  WALLET_RECOVERY_CHAIN
} from '@web/modules/social-recovery/shared/client'
import type {
  HeldRequestQueue,
  ListedAccount,
  WatcherConnection
} from '@web/modules/social-recovery/shared/client'
import { useAccountFacts } from '@web/modules/social-recovery/shared/client/useAccountFacts'
import { useRecoveryClient } from '@web/modules/social-recovery/shared/client/useRecoveryClient'
import { watcherConnectionFor } from '@web/modules/social-recovery/shared/client/watcher-reads'
import { recordDeploymentOf } from '@web/modules/social-recovery/shared/records/deployment'
import { extensionRecordStorage } from '@web/modules/social-recovery/shared/records/extensionStorage'
import { watchedNetworkOf } from '@web/modules/social-recovery/watcher'

import CancelView from './CancelView'
import { attemptReaderOf, cancelDeploymentOf, landingReaderOf } from './reads'
import { accountOfSearch } from './search'
import { cancelStepsOf } from './steps'
import type {
  ArrivalReader,
  AttemptReader,
  CancelBodyProps,
  CancelReadiness,
  CancelSteps,
  LandingReader
} from './types'
import { useAttemptRead } from './useAttemptRead'
import { useCancelWrite } from './useCancelWrite'
import { useMoveFunds } from './useMoveFunds'

const CHAIN_ID = CHAIN_IDS[WALLET_RECOVERY_CHAIN]

const CancelBody = ({ account }: CancelBodyProps) => {
  const { navigate } = useNavigation()
  const { accounts } = useAccountsControllerState()
  const { networks } = useNetworksControllerState()
  const { dispatch, windowId } = useBackgroundService()
  const queue = useRequestsControllerState()
  const { account: selectedAccount } = useSelectedAccountControllerState()
  const clientState = useRecoveryClient(account)
  const facts = useAccountFacts(account)
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  const storage = extensionRecordStorage

  // The watcher's reads over a provider of the page's own, released when the page leaves.
  const network = watchedNetworkOf(networks)
  const descriptor = useMemo(() => cancelDeploymentOf(), [])
  const networkRef = useRef(network)
  networkRef.current = network
  // The provider is built again only when the network record's provider fields change.
  const networkKey = network ? providerKeyOf(network) : null
  const [connection, setConnection] = useState<WatcherConnection | null>(null)
  useEffect(() => {
    const current = networkRef.current
    if (!networkKey || !current || !descriptor) {
      setConnection(null)
      return undefined
    }
    const built = watcherConnectionFor(current, descriptor)
    setConnection(built)
    return () => built.destroy()
  }, [networkKey, descriptor])

  const readAttempt = useMemo<AttemptReader | null>(() => {
    if (connection && descriptor) {
      return attemptReaderOf({
        reads: connection.reads,
        deployment: recordDeploymentOf(descriptor),
        account,
        chainId: CHAIN_ID,
        storage
      })
    }
    // A build that reads no deployed kit, or a wallet with no network for the chain, cannot read.
    if (networks && (!network || !descriptor)) {
      return () => Promise.reject(new Error('This build reads no recovery deployment.'))
    }
    return null
  }, [connection, account, storage, networks, network, descriptor])

  // The attempt the holder can cancel is the one this page's own fresh read finds open.
  const readArrival = useMemo<ArrivalReader | null>(
    () => (readAttempt ? async () => ({ reading: await readAttempt() }) : null),
    [readAttempt]
  )
  const { read, retry: retryRead } = useAttemptRead(readArrival)
  const readLanding = useMemo<LandingReader | null>(
    () =>
      connection && readAttempt
        ? landingReaderOf({ reads: connection.reads, account, readAttempt })
        : null,
    [connection, readAttempt, account]
  )

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

  const kit = clientState.status === 'ready' ? clientState.client : null
  const chainReads = clientState.status === 'ready' ? clientState.reads : null
  const receipts = clientState.status === 'ready' ? clientState.receipts : null
  const ready = facts.status === 'ready' ? facts.facts : null
  const steps = useMemo<CancelSteps | null>(() => {
    if (!kit || !chainReads || !receipts || !ready?.key || !readAttempt || !readLanding) {
      return null
    }
    return cancelStepsOf({
      account,
      chainId: CHAIN_ID,
      client: kit,
      chainReads,
      receipts,
      port,
      requests,
      facts: ready,
      key: ready.key,
      readAttempt,
      readLanding,
      storage
    })
  }, [kit, chainReads, receipts, ready, readAttempt, readLanding, account, port, requests, storage])
  const run = useCancelWrite(steps, `${CHAIN_ID}:${account.toLowerCase()}`)

  const failed =
    clientState.status === 'failed' ||
    clientState.status === 'update-the-wallet' ||
    facts.status === 'unavailable'
  const noKey = facts.status === 'ready' && !facts.facts.key
  let readiness: CancelReadiness = 'loading'
  if (steps) {
    readiness = 'ready'
  } else if (noKey) {
    readiness = 'noKey'
  } else if (failed) {
    readiness = 'failed'
  }
  const retryReady = useCallback(() => {
    if (clientState.status === 'failed' || clientState.status === 'update-the-wallet') {
      clientState.retry()
    }
    if (facts.status === 'unavailable') {
      facts.retry()
    }
  }, [clientState, facts])

  const toDashboard = useCallback(() => navigate(`/${WEB_ROUTES.dashboard}`), [navigate])
  const moveFunds = useMoveFunds(ready ? (ready.account.addr as Address) : null)

  return (
    <CancelView
      read={read}
      run={run.state}
      readiness={readiness}
      timeZone={timeZone}
      onRetryRead={retryRead}
      onRetryReady={retryReady}
      onSend={run.start}
      onRecheck={run.recheck}
      onCheckAgain={run.checkAgain}
      onBack={toDashboard}
      onDone={toDashboard}
      onMoveFunds={moveFunds.move}
      moveFundsBusy={moveFunds.busy}
    />
  )
}

const CancelScreen = () => {
  const location = useLocation()
  const { navigate } = useNavigation()
  const account = useMemo(() => accountOfSearch(location.search), [location.search])

  useEffect(() => {
    if (!account) {
      navigate(`/${WEB_ROUTES.dashboard}`, { replace: true })
    }
  }, [account, navigate])

  return (
    <RecoveryChrome route="logged-in" titleKey="socialRecovery.cancel.confirm.title">
      {account ? <CancelBody key={account} account={account} /> : null}
    </RecoveryChrome>
  )
}

export default React.memo(CancelScreen)
