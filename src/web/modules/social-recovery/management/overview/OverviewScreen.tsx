/**
 * The overview's route: the settings chrome around the overview of the setup
 * tab's account on the recovery chain. It builds the recovery client, runs
 * the overview's reads, reads the watcher's record for the ending and mounts
 * the cancel lane's banner of the account while an attempt is open. A write
 * of the overview stored on this device as in flight opens its own step
 * again, so the run follows it instead of sending a second one; a write the
 * management editor stored is left to the editor's screen, and a save of the
 * setup flow to the save screen, and the overview points there.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import { useTranslation } from '@common/config/localization'
import useNavigation from '@common/hooks/useNavigation'
import spacings from '@common/styles/spacings'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import AccountAttemptBanner from '@web/modules/social-recovery/cancel/AccountAttemptBanner'
import { pollOnce } from '@web/modules/social-recovery/cancel/reads'
import { cancelPathOf } from '@web/modules/social-recovery/cancel/search'
import { useDismissed } from '@web/modules/social-recovery/cancel/useDismissed'
import { CHAIN_NAMES } from '@web/modules/social-recovery/recovery/entry/constants'
import type { ReadoutRowContext } from '@web/modules/social-recovery/recovery/entry/types'
import type { Address } from '@kohaku-eth/social-recovery'
import { relyingPartyOf } from '@web/modules/social-recovery/shared/ceremony'
import { ActionsRow } from '@web/modules/social-recovery/shared/chrome'
import SetupChrome from '@web/modules/social-recovery/shared/chrome/SetupChrome'
import useSetupAccount from '@web/modules/social-recovery/shared/chrome/useSetupAccount'
import {
  addressBookOf,
  CHAIN_IDS,
  networkOf,
  sameAddress,
  WALLET_RECOVERY_CHAIN
} from '@web/modules/social-recovery/shared/client'
import { useRecoveryClient } from '@web/modules/social-recovery/shared/client/useRecoveryClient'
import { renderFullAddress } from '@web/modules/social-recovery/shared/display'
import {
  createWalletRecords,
  extensionRecordStorage
} from '@web/modules/social-recovery/shared/records'
import { intentOfRequest, overviewIntentOf } from '@web/modules/social-recovery/shared/writes'
import { kindOfMethodIn } from '@web/modules/social-recovery/setup/privacy/exposure'
import { kindNameOf, trustRowsOf } from '@web/modules/social-recovery/setup/review'
import { useTrustReads } from '@web/modules/social-recovery/setup/review/useTrustReads'
import { dismissAttempt, watchedNetworkOf } from '@web/modules/social-recovery/watcher'
import { useWatchedAttempt } from '@web/modules/social-recovery/watcher/useWatchedAttempt'

import { MANAGE_LINKS, SAVE_LINK } from './constants'
import OverviewView from './OverviewView'
import OverviewWriteStep from './OverviewWriteStep'
import { clausesOfPath, movedInPath, pathMethodsOf } from './readings'
import type { ElsewhereLink, OpenStep, OverviewIntent, OverviewStageProps } from './types'
import { useOverviewReads } from './useOverviewReads'

const OverviewStage = ({ records, chainId, account, navigate }: OverviewStageProps) => {
  const { t } = useTranslation()
  const { networks } = useNetworksControllerState()
  const clientState = useRecoveryClient(account)
  const reads = useOverviewReads({
    client: clientState,
    records,
    watcherStorage: extensionRecordStorage,
    chainId,
    account
  })
  const watched = useWatchedAttempt(account)
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  const kit = clientState.status === 'ready' ? clientState.client : null

  const addressBook = useMemo(() => addressBookOf(WALLET_RECOVERY_CHAIN), [])
  const context = useMemo<ReadoutRowContext>(
    () => ({ addressBook, ownRpIdHash: relyingPartyOf(window.location).rpIdHash }),
    [addressBook]
  )
  const networkName =
    networkOf(networks, WALLET_RECOVERY_CHAIN)?.name ?? CHAIN_NAMES[WALLET_RECOVERY_CHAIN]

  // The declarations of the moved methods alone are read, for the admin each names.
  const moved = useMemo(
    () =>
      reads.notices.status === 'answered'
        ? movedInPath(reads.notices.value.moved, pathMethodsOf(reads.path, addressBook)).map(
            ({ method }) => method
          )
        : [],
    [reads.notices, reads.path, addressBook]
  )
  const trust = useTrustReads(kit?.moduleReads ?? null, moved)
  const rows = useMemo(
    () =>
      trustRowsOf({
        clauses: clausesOfPath(reads.path),
        enrollments: [],
        reads: trust.reads,
        shippedMethods: kit?.descriptor.shippedMethods ?? [],
        addressBook
      }),
    [reads.path, trust.reads, kit, addressBook]
  )
  const adminOf = useCallback(
    (method: Address): Address | undefined => {
      const contract = rows.find((row) => sameAddress(row.method, method))?.contract
      if (contract?.status === 'declared') {
        return contract.admin
      }
      return contract?.status === 'third-party' ? contract.declaration?.admin : undefined
    },
    [rows]
  )
  const methodNameOf = useCallback(
    (method: Address): string => {
      const kind = kindOfMethodIn(addressBook)(method)
      return kind ? kindNameOf(kind, t) : renderFullAddress(method)
    },
    [addressBook, t]
  )

  const [open, setOpen] = useState<OpenStep | null>(null)
  const [elsewhere, setElsewhere] = useState<ElsewhereLink | null>(null)
  const [heldRound, setHeldRound] = useState(0)
  // A write of the overview this device holds in flight opens its step, whose run follows it;
  // one of the management editor or a save of the setup flow is left to its own screen. Read
  // on arrival, and again where a step's run stopped at a write it does not follow, or where
  // the tab is shown again while that write is pointed to.
  useEffect(() => {
    let live = true
    records
      .saveInFlight(chainId, account)
      .read()
      .then(
        (held) => {
          if (!live) {
            return
          }
          const requestId = held.status === 'present' ? held.value.requestId : undefined
          const managed = requestId ? intentOfRequest(requestId) : undefined
          if (managed === 'manageEdit' || managed === 'manageRemove') {
            setElsewhere(MANAGE_LINKS[managed])
          } else {
            setElsewhere(requestId && !managed ? SAVE_LINK : null)
          }
          const intent = requestId ? overviewIntentOf(requestId) : undefined
          if (intent) {
            setOpen({ intent, autoStart: false })
          }
        },
        () => undefined
      )
    return () => {
      live = false
    }
  }, [records, chainId, account, heldRound])

  const onOpen = useCallback((intent: OverviewIntent) => {
    // The mirror's action is the holder's confirmation itself; the other two confirm on their step.
    setOpen({ intent, autoStart: intent === 'removeAuthorization' })
  }, [])
  const { retry } = reads
  const onFinished = useCallback(() => {
    setOpen(null)
    retry()
  }, [retry])
  const onLeft = useCallback(() => {
    setOpen(null)
    retry()
    setHeldRound((round) => round + 1)
  }, [retry])
  useEffect(() => {
    if (!elsewhere) {
      return undefined
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        retry()
        setHeldRound((round) => round + 1)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [elsewhere, retry])
  const onClose = useCallback(() => setOpen(null), [])

  const onCancel = useCallback((target: Address) => navigate(cancelPathOf(target)), [navigate])
  const onDismiss = useCallback(
    (target: Address, attemptId: bigint) => dismissAttempt(chainId, target, attemptId),
    [chainId]
  )
  const network = watchedNetworkOf(networks)
  const onRetryPoll = useCallback(
    (target: Address) => pollOnce({ account: target, network }),
    [network]
  )

  const held = elsewhere ? (
    <Alert
      testID="overview-write-elsewhere"
      type="warning"
      size="sm"
      style={spacings.mbSm}
      text={t(elsewhere.line)}
    >
      <ActionsRow
        primary={
          <Button
            testID="overview-open-elsewhere"
            type="secondary"
            size="small"
            text={t(elsewhere.label)}
            onPress={() => navigate(elsewhere.route)}
            hasBottomSpacing={false}
          />
        }
      />
    </Alert>
  ) : null

  const step =
    open && clientState.status === 'ready' && reads.facts.status === 'answered' ? (
      <OverviewWriteStep
        key={open.intent}
        intent={open.intent}
        client={clientState.client}
        chainReads={clientState.reads}
        receipts={clientState.receipts}
        records={records}
        chainId={chainId}
        account={account}
        facts={reads.facts.value}
        reads={reads}
        autoStart={open.autoStart}
        onFinished={onFinished}
        onLeft={onLeft}
        onClose={onClose}
        navigate={navigate}
      />
    ) : null

  return (
    <OverviewView
      reads={reads}
      context={context}
      networkName={networkName}
      timeZone={timeZone}
      ending={watched.status === 'watched' ? watched.reading?.ended : undefined}
      methodNameOf={methodNameOf}
      adminOf={adminOf}
      banner={
        <AccountAttemptBanner
          account={account}
          useAttempt={useWatchedAttempt}
          useDismissed={useDismissed}
          onCancel={onCancel}
          onDismiss={onDismiss}
          onRetry={onRetryPoll}
          timeZone={timeZone}
        />
      }
      step={step}
      held={held}
      onOpen={onOpen}
      navigate={navigate}
    />
  )
}

const OverviewScreen = () => {
  const { navigate } = useNavigation()
  const { account } = useSetupAccount()
  const records = useMemo(() => createWalletRecords({ storage: extensionRecordStorage }), [])
  const chainId = CHAIN_IDS[WALLET_RECOVERY_CHAIN]

  return (
    <SetupChrome testID="overview-screen">
      {/* Another account mounts a new stage, so no read or step carries across. */}
      {!!account && (
        <OverviewStage
          key={`${chainId}:${account}`}
          records={records}
          chainId={chainId}
          account={account}
          navigate={navigate}
        />
      )}
    </SetupChrome>
  )
}

export default React.memo(OverviewScreen)
