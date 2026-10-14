/**
 * The account step: the field, then the lookup of the account's setup, the
 * confirmation that it is the holder's account, and the reads that decide
 * whether this recovery can go on. The confirmation writes the recovery entry
 * before any of those reads runs; where the account already has an entry and
 * a live session, the confirmation resumes that recovery at the checklist and
 * writes nothing. Leaving a state that refuses the account clears the entry,
 * so a refused account never reads as a recovery in progress. Every read has
 * its loading state and its failed state with retry; none renders as the next
 * state before it answered.
 */
import React, { useCallback, useState } from 'react'
import { View } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import {
  checklistPathOf,
  readoutPathOf,
  routeEntryPathOf
} from '@web/modules/social-recovery/recovery/checklist/search'
import { SectionCard, SectionLabel } from '@web/modules/social-recovery/shared/chrome'
import { renderFullAddress } from '@web/modules/social-recovery/shared/display'

import ConfirmAccount from './ConfirmAccount'
import ConfirmedReadsView from './ConfirmedReadsView'
import LookupField from './LookupField'
import LookupState from './LookupState'
import { confirmedStepOf } from './refusal'
import type { AccountStepViewProps } from './types'
import { useConfirmedReads } from './useConfirmedReads'
import { useSetupRead } from './useSetupRead'

const LABELS = 'socialRecovery.entry.labels'

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
  navigate
}: AccountStepViewProps) => {
  const { t } = useTranslation()
  const [confirmed, setConfirmed] = useState(false)
  const [writing, setWriting] = useState(false)
  const [writeFailed, setWriteFailed] = useState(false)

  const ready = client.status === 'ready' ? client.client : null
  const { setupState, retry: retrySetup } = useSetupRead(target ? ready : null)
  const reads = useConfirmedReads(ready, destination, confirmed)

  const backToField = useCallback(() => {
    setConfirmed(false)
    setWriteFailed(false)
    onTarget(null)
  }, [onTarget])

  /** Clears the entry this step wrote, then leaves; a failed clear does not hold the holder here. */
  const leave = useCallback(
    (next: () => void) => {
      if (!confirmed || !target) {
        next()
        return
      }
      records.recoveryEntry(chainId, target.address).clear().then(next, next)
    },
    [confirmed, target, records, chainId]
  )

  const confirm = useCallback(() => {
    if (!target || writing) {
      return
    }
    const { address } = target
    setWriting(true)
    setWriteFailed(false)
    const entry = records.recoveryEntry(chainId, address)
    const resumes = async (): Promise<boolean> => {
      const held = await entry.read()
      if (held.status !== 'present') {
        return false
      }
      const session = await records.recoverySession(chainId, address).read()
      return session.status === 'present' && session.value.state === 'live'
    }
    resumes()
      .then(async (resume) => {
        if (resume) {
          return 'resume' as const
        }
        await entry.write({
          account: address,
          route: search.route,
          receivingAccount: search.receivingAccount
        })
        return 'written' as const
      })
      .then(
        (outcome) => {
          setWriting(false)
          if (outcome === 'resume') {
            navigate(checklistPathOf(address))
          } else {
            setConfirmed(true)
          }
        },
        () => {
          setWriting(false)
          setWriteFailed(true)
        }
      )
  }, [target, writing, records, chainId, search, navigate])

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
      />
    )
  }

  return (
    <View testID="entry-confirmed">
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
      <ConfirmedReadsView
        step={confirmedStepOf(reads, destination)}
        route={search.route}
        networkName={networkName}
        attemptActive={found.attemptActive}
        onRetry={reads.retry}
        onBack={() => leave(backToField)}
        onChooseAnother={() => leave(() => navigate(routeEntryPathOf(search.route)))}
        onContinue={() => navigate(readoutPathOf(target.address))}
      />
    </View>
  )
}

export default React.memo(AccountStepView)
