/**
 * The account step: the field, then the lookup of the account's setup, the
 * confirmation that it is the holder's account, and the reads that decide
 * whether this recovery can go on. The confirmation writes the recovery entry
 * before any of those reads runs; where the account already has an entry and
 * a live session, the confirmation resumes that recovery at the checklist and
 * writes nothing. Leaving a state that refuses the account clears the entry,
 * so a refused account never reads as a recovery in progress. The account
 * being recovered never receives its own control: a confirmation that names
 * it as the receiving account is refused and writes nothing, and a stored
 * entry that names it, which an earlier build could write, never resumes; it
 * is refused the same way, and leaving that refusal removes the entry and its
 * live session, which binds the account's own key and was never valid. Every read has
 * its loading state and its failed state with retry; none renders as the next
 * state before it answered. Where the setup read finds an attempt already
 * running and the account still authorizes the module, the band naming it
 * stands in place of continue until the registry says no attempt waits; then
 * the band says the attempt ended and continue comes back.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
import { isAddressEqual } from 'viem'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import {
  checklistPathOf,
  readoutPathOf,
  routeEntryPathOf
} from '@web/modules/social-recovery/recovery/checklist/search'
import { SectionCard, SectionLabel, TwoColumn } from '@web/modules/social-recovery/shared/chrome'
import type { Address } from '@kohaku-eth/social-recovery'
import { renderFullAddress } from '@web/modules/social-recovery/shared/display'
import {
  isOfDeployment,
  recordDeploymentOf,
  isSessionOfDeployment
} from '@web/modules/social-recovery/shared/records'

import ConfirmAccount from './ConfirmAccount'
import ConfirmedReadsView from './ConfirmedReadsView'
import LookupField from './LookupField'
import LookupState from './LookupState'
import { receivingChoicesOf } from './receiving'
import { confirmedStepOf } from './refusal'
import { ownKeysOf, runningClaimOf } from './running'
import RunningAttemptBand from './RunningAttemptBand'
import type {
  AccountStepViewProps,
  ConfirmedStep,
  ResumeJudgement,
  SameAccountRefusal
} from './types'
import { useConfirmedReads } from './useConfirmedReads'
import { useRunningAttempt } from './useRunningAttempt'
import { useSetupRead } from './useSetupRead'

const LABELS = 'socialRecovery.entry.labels'

const SAME_ACCOUNT: ConfirmedStep = { kind: 'destination', refusal: 'same-account' }

const AccountStepView = ({
  records,
  chainId,
  search,
  destination,
  networkName,
  target,
  onTarget,
  client,
  resolveName,
  accounts,
  keys,
  openAttemptReads,
  navigate,
  counter
}: AccountStepViewProps) => {
  const { t } = useTranslation()
  const [confirmed, setConfirmed] = useState(false)
  const [writing, setWriting] = useState(false)
  const [writeFailed, setWriteFailed] = useState(false)
  const [sameAccount, setSameAccount] = useState<SameAccountRefusal | null>(null)

  const ready = client.status === 'ready' ? client.client : null
  const { setupState, retry: retrySetup } = useSetupRead(target ? ready : null)
  const reads = useConfirmedReads(ready, destination, confirmed && sameAccount === null)

  // The band of an attempt already running stands once the account still
  // authorizes the module; where it does not, the dormant reading wins.
  const attemptActive =
    setupState.status === 'answered' && setupState.value.hasSetup && setupState.value.attemptActive
  const authorized = reads.authorization?.status === 'answered' && reads.authorization.value
  const bandActive = !!target && confirmed && attemptActive && authorized
  const choices = useMemo(() => receivingChoicesOf(accounts, keys), [accounts, keys])
  // Kept by content, so a wallet update that names the same keys reads nothing again.
  const heldOwnKeys = target ? ownKeysOf(accounts, keys, target.address) : []
  const ownKeysRef = useRef<Address[]>(heldOwnKeys)
  if (heldOwnKeys.join(',') !== ownKeysRef.current.join(',')) {
    ownKeysRef.current = heldOwnKeys
  }
  const ownKeys = ownKeysRef.current
  const running = useRunningAttempt({
    account: target?.address ?? destination,
    chainId,
    records,
    client: ready,
    ownKeys,
    openReads: openAttemptReads,
    setupBlock: setupState.status === 'answered' ? setupState.value.block.number : null,
    active: bandActive
  })
  const claim = useMemo(
    () => runningClaimOf(running.opening, running.entries, choices, keys, search.route),
    [running.opening, running.entries, choices, keys, search.route]
  )
  // An attempt that ended while the band stood leaves the band saying so, and
  // continue to the readout comes back; so does it for a recovery to a key
  // this wallet holds under no account it lists, which cannot continue here.
  const ownedWithoutAccount =
    (claim.ownership === 'seed' || claim.ownership === 'wallet') && !claim.target
  const bandStands = bandActive && running.attempt.status !== 'ended' && !ownedWithoutAccount

  const backToField = useCallback(() => {
    setConfirmed(false)
    setWriteFailed(false)
    setSameAccount(null)
    onTarget(null)
  }, [onTarget])

  /** Removes a stored entry that names the account as its own receiver, and its live session. */
  const dropSameAccountEntry = useCallback(
    async (address: Address) => {
      const session = await records.recoverySession(chainId, address).read()
      if (session.status === 'present' && session.value.state === 'live') {
        await records.wipeRecoverySession(chainId, address, 'recoverer-abandoned', session.revision)
        const wiped = await records.recoverySession(chainId, address).read()
        if (wiped.status === 'present' && wiped.value.state === 'wiped') {
          await records.clearWipedSession(chainId, address, wiped.revision)
        }
      }
      await records.recoveryEntry(chainId, address).clear()
    },
    [records, chainId]
  )

  /**
   * Clears the entry this step wrote, or the stored entry it refused, then
   * leaves; a refusal of the account named as its own receiver wrote nothing.
   * A failed clear does not hold the holder here.
   */
  const leave = useCallback(
    (next: () => void) => {
      if (!confirmed || !target || sameAccount === 'asked') {
        next()
        return
      }
      const clear =
        sameAccount === 'stored'
          ? dropSameAccountEntry(target.address)
          : records.recoveryEntry(chainId, target.address).clear()
      clear.then(next, next)
    },
    [confirmed, target, sameAccount, dropSameAccountEntry, records, chainId]
  )

  const confirm = useCallback(() => {
    if (!target || writing) {
      return
    }
    const { address } = target
    setWriteFailed(false)
    if (isAddressEqual(search.receivingAccount, address)) {
      setSameAccount('asked')
      setConfirmed(true)
      return
    }
    setWriting(true)
    const entry = records.recoveryEntry(chainId, address)
    // An entry or a session of another deployment, or one that names none, is not resumed.
    const resumes = async (): Promise<ResumeJudgement> => {
      const held = await entry.read()
      if (
        !ready ||
        held.status !== 'present' ||
        !isOfDeployment(held.value.deployment, ready.descriptor)
      ) {
        return 'write'
      }
      if (isAddressEqual(held.value.receivingAccount, address)) {
        return 'same-account'
      }
      const session = await records.recoverySession(chainId, address).read()
      return session.status === 'present' &&
        session.value.state === 'live' &&
        isSessionOfDeployment(session.value, ready.descriptor)
        ? 'resume'
        : 'write'
    }
    resumes()
      .then(async (resume) => {
        if (resume !== 'write') {
          return resume
        }
        await entry.write({
          account: address,
          route: search.route,
          receivingAccount: search.receivingAccount,
          ...(ready ? { deployment: recordDeploymentOf(ready.descriptor) } : {})
        })
        return 'written' as const
      })
      .then(
        (outcome) => {
          setWriting(false)
          if (outcome === 'resume') {
            navigate(checklistPathOf(address))
            return
          }
          if (outcome === 'same-account') {
            setSameAccount('stored')
          }
          setConfirmed(true)
        },
        () => {
          setWriting(false)
          setWriteFailed(true)
        }
      )
  }, [target, writing, ready, records, chainId, search, navigate])

  if (!target) {
    return (
      <LookupField
        networkName={networkName}
        onTarget={onTarget}
        resolveName={resolveName}
        onBack={
          search.route === 'logged-in' ? () => navigate(routeEntryPathOf(search.route)) : undefined
        }
        onCancel={() => navigate(WEB_ROUTES.socialRecoverySetup)}
        counter={counter}
      />
    )
  }

  const found =
    ready !== null && setupState.status === 'answered' && setupState.value.hasSetup
      ? setupState.value
      : null

  if (!found) {
    return (
      <LookupState
        target={target}
        networkName={networkName}
        client={client}
        setupState={setupState}
        onRetrySetup={retrySetup}
        onAnotherAddress={() => leave(backToField)}
        onClose={
          search.route === 'logged-in'
            ? () => leave(() => navigate(WEB_ROUTES.socialRecoverySetup))
            : undefined
        }
        counter={counter}
      />
    )
  }

  if (!confirmed) {
    return (
      <ConfirmAccount
        target={target}
        networkName={networkName}
        writing={writing}
        writeFailed={writeFailed}
        onConfirm={confirm}
        onNotMine={backToField}
        counter={counter}
      />
    )
  }

  return (
    <TwoColumn testID="entry-confirmed-columns">
      <View testID="entry-confirmed">
        {counter}
        <SectionCard>
          <SectionLabel>{t(`${LABELS}.accountLookedUp`)}</SectionLabel>
          <Text
            fontSize={14}
            weight="number_medium"
            selectable
            style={spacings.mbTy}
            testID="entry-confirmed-address"
          >
            {renderFullAddress(target.address)}
          </Text>
          <Text fontSize={12} appearance="secondaryText">
            {networkName}
          </Text>
        </SectionCard>
        {bandActive && ready && (
          <RunningAttemptBand
            state={running}
            claim={claim}
            account={target.address}
            chainId={chainId}
            deployment={recordDeploymentOf(ready.descriptor)}
            records={records}
            navigate={navigate}
          />
        )}
        <ConfirmedReadsView
          step={
            sameAccount
              ? SAME_ACCOUNT
              : confirmedStepOf(reads, destination, {
                  confirmed: target.address,
                  receiving: search.receivingAccount
                })
          }
          route={search.route}
          networkName={networkName}
          attemptActive={found.attemptActive}
          runningBand={bandStands}
          onRetry={reads.retry}
          onBack={() => leave(backToField)}
          onChooseAnother={() => leave(() => navigate(routeEntryPathOf(search.route)))}
          onContinue={() => navigate(readoutPathOf(target.address))}
        />
      </View>
    </TwoColumn>
  )
}

export default React.memo(AccountStepView)
