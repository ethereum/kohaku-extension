/**
 * The account step after the confirmation: each read running, a read that
 * failed with its retry, a dormant setup, an account this release cannot
 * recover with the reason the wallet writes from the code, a key a recovery
 * cannot install with the remedy of another account, and continue to the
 * readout once every read answered and nothing refused.
 */
import React from 'react'
import { ActivityIndicator, View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { ActionsRow, SectionCard, StatusChip } from '@web/modules/social-recovery/shared/chrome'
import ReadFailedBlock from '@web/modules/social-recovery/shared/chrome/ReadFailedBlock'
import { chipKey } from '@web/modules/social-recovery/shared/display'

import type {
  ConfirmedReadsViewProps,
  ConfirmedStage,
  DestinationRefusal,
  RecoverRefusal
} from './types'

const ENTRY = 'socialRecovery.entry'
const CANNOT_RECOVER = 'socialRecovery.review.blocked.cannotRecover'

/** The reason a refusal renders under the headline, by its code. */
const REFUSAL_REASONS: Record<RecoverRefusal, string> = {
  'not-supported': `${CANNOT_RECOVER}.reasonNotSupported`,
  'several-keys': `${CANNOT_RECOVER}.reasonSeveralKeys`,
  'removed-unknown': `${ENTRY}.refusal.removedUnknown`,
  'removed-not-authority': `${ENTRY}.refusal.removedNotAuthority`
}

const DESTINATION_REFUSALS: Record<DestinationRefusal, string> = {
  'already-a-key': `${ENTRY}.destination.alreadyAKey`,
  'holds-privilege': `${ENTRY}.destination.holdsPrivilege`
}

/** The title and the line of a read that failed, by its stage. */
const FAILED_COPY: Record<ConfirmedStage, { title: string; body: string }> = {
  authorization: {
    title: `${ENTRY}.confirm.authorizationReadFailedTitle`,
    body: `${ENTRY}.confirm.readFailed`
  },
  fit: {
    title: `${ENTRY}.confirm.fitReadFailedTitle`,
    body: `${ENTRY}.confirm.fitReadFailedBody`
  },
  destination: {
    title: `${ENTRY}.account.errors.readFailedTitle`,
    body: `${ENTRY}.confirm.readFailed`
  }
}

const ConfirmedReadsView = ({
  step,
  route,
  networkName,
  attemptActive,
  onRetry,
  onBack,
  onChooseAnother,
  onContinue
}: ConfirmedReadsViewProps) => {
  const { t } = useTranslation()

  // Every blocked state offers one way out and no continue.
  const back = (onPress: () => void, testID: string) => (
    <View style={[flexbox.directionRow, spacings.mtTy]}>
      <Button
        testID={testID}
        type="secondary"
        size="small"
        text={t('socialRecovery.ceremony.backAction')}
        onPress={onPress}
        hasBottomSpacing={false}
      />
    </View>
  )

  const line = (text: string, testID?: string) => (
    <Text fontSize={14} style={spacings.mbTy} testID={testID}>
      {text}
    </Text>
  )

  if (step.kind === 'reading') {
    return (
      <View
        testID={`entry-reads-${step.stage}-loading`}
        style={[flexbox.directionRow, flexbox.alignCenter]}
      >
        <ActivityIndicator style={spacings.mrSm} />
        <Text fontSize={14} appearance="secondaryText">
          {t(`${ENTRY}.confirm.readingSetup`)}
        </Text>
      </View>
    )
  }

  if (step.kind === 'failed') {
    const copy = FAILED_COPY[step.stage]
    return (
      <ReadFailedBlock
        testID={`entry-reads-${step.stage}-failed`}
        title={t(copy.title, { network: networkName })}
        body={t(copy.body)}
        onRetry={onRetry}
      />
    )
  }

  if (step.kind === 'dormant') {
    return (
      <SectionCard testID="entry-dormant">
        <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap, spacings.mbTy]}>
          <StatusChip
            text={t(chipKey('recovery', 'notActive'))}
            tone="warning"
            style={spacings.mrSm}
            testID="entry-dormant-chip"
          />
          <Text fontSize={16} weight="medium" testID="entry-dormant-title">
            {t(`${ENTRY}.dormant.title`)}
          </Text>
        </View>
        {line(t(`${ENTRY}.dormant.onlyOwnKey`))}
        {line(t(`${ENTRY}.dormant.neverExecutes`))}
        {attemptActive && line(t(`${ENTRY}.dormant.runningCannotExecute`), 'entry-dormant-running')}
        {back(onBack, 'entry-dormant-back')}
      </SectionCard>
    )
  }

  if (step.kind === 'cannot-recover') {
    return (
      <SectionCard testID="entry-cannot-recover">
        <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap, spacings.mbTy]}>
          <StatusChip
            text={t(chipKey('recovery', 'cannotRecover'))}
            tone="error"
            style={spacings.mrSm}
          />
          <Text fontSize={16} weight="medium" testID="entry-cannot-recover-title">
            {t(`${CANNOT_RECOVER}.title`)}
          </Text>
        </View>
        <Text fontSize={14} appearance="secondaryText" testID="entry-cannot-recover-reason">
          {t(REFUSAL_REASONS[step.refusal])}
        </Text>
        {back(onBack, 'entry-cannot-recover-back')}
      </SectionCard>
    )
  }

  if (step.kind === 'destination') {
    return (
      <SectionCard testID={`entry-destination-${step.refusal}`}>
        {line(t(DESTINATION_REFUSALS[step.refusal]), 'entry-destination-refusal')}
        {route === 'logged-in'
          ? back(onChooseAnother, 'entry-destination-choose-another')
          : back(onBack, 'entry-destination-back')}
      </SectionCard>
    )
  }

  return (
    <ActionsRow
      primary={
        <Button
          testID="entry-continue"
          type="primary"
          text={t('socialRecovery.actions.continue')}
          onPress={onContinue}
          hasBottomSpacing={false}
        />
      }
    />
  )
}

export default React.memo(ConfirmedReadsView)
