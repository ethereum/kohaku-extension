/**
 * The band of an attempt already running against the looked-up account: the
 * title, then when it finishes once the registry answered, the key it hands
 * the account to once its opening decoded, and whose recovery it is. Where
 * the key is one this device holds, the band says so and offers to continue
 * with that key. Otherwise it waits it out, or, for a reader who holds the
 * account's own key, offers the cancel. A read that failed draws its line
 * with retry, never no attempt and never a key; a later read of the attempt
 * that failed draws its line with retry above the attempt last read. Whose
 * recovery it is waits for the listing of the recovery entries, and a
 * listing that failed draws its line with retry and no claim. An attempt
 * that ended while the band stood leaves the band saying so.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { SectionCard } from '@web/modules/social-recovery/shared/chrome'
import LoadingBlock from '@web/modules/social-recovery/shared/chrome/LoadingBlock'
import ReadFailedBlock from '@web/modules/social-recovery/shared/chrome/ReadFailedBlock'
import RefreshingLine from '@web/modules/social-recovery/shared/chrome/RefreshingLine'
import {
  renderDateTimeInZone,
  renderFullAddress,
  renderValueLabel
} from '@web/modules/social-recovery/shared/display'

import type { RunningAttemptBandViewProps } from './types'

const RUNNING = 'socialRecovery.entry.runningAttempt'

const RunningAttemptBandView = ({
  attempt,
  refreshFailed,
  refreshing,
  opening,
  entries,
  ownership,
  authority,
  canContinue,
  continueState,
  timeZone,
  onRetry,
  onContinue,
  onCancel
}: RunningAttemptBandViewProps) => {
  const { t } = useTranslation()

  const line = (text: string, testID: string, secondary = false) => (
    <Text
      fontSize={14}
      appearance={secondary ? 'secondaryText' : 'primaryText'}
      style={spacings.mbTy}
      testID={testID}
    >
      {text}
    </Text>
  )

  const failed = (testID: string, title: string = t(`${RUNNING}.readFailed`)) => (
    <ReadFailedBlock testID={testID} title={title} onRetry={onRetry} />
  )

  const whose = () => {
    if (ownership === 'seed' || ownership === 'wallet') {
      return (
        <>
          {line(
            t(ownership === 'seed' ? `${RUNNING}.yoursSeed` : `${RUNNING}.yoursWallet`),
            'entry-running-yours'
          )}
          {continueState === 'failed' &&
            line(t(`${RUNNING}.writeFailed`), 'entry-running-continue-failed')}
          {canContinue && (
            <View style={[flexbox.directionRow, spacings.mtTy]}>
              <Button
                testID="entry-running-continue"
                type="primary"
                size="small"
                text={t(`${RUNNING}.continueWithKey`)}
                onPress={onContinue}
                disabled={continueState === 'writing' || refreshing}
                hasBottomSpacing={false}
              />
            </View>
          )}
        </>
      )
    }
    if (ownership !== 'not-yours') {
      return null
    }
    const holdsOwnKey = authority.status === 'answered' && authority.value
    return (
      <>
        {line(t(`${RUNNING}.notYours`), 'entry-running-not-yours')}
        {authority.status === 'failed' &&
          failed('entry-running-authority-failed', t(`${RUNNING}.authorityFailed`))}
        {authority.status === 'answered' &&
          !authority.value &&
          line(t(`${RUNNING}.waitItOut`), 'entry-running-wait-it-out')}
        {holdsOwnKey && (
          <>
            {line(t(`${RUNNING}.cancelExitBody`), 'entry-running-cancel-body', true)}
            <View style={[flexbox.directionRow, spacings.mtTy]}>
              <Button
                testID="entry-running-cancel"
                type="secondary"
                size="small"
                text={t(`${RUNNING}.cancelExit`)}
                onPress={onCancel}
                disabled={refreshing}
                hasBottomSpacing={false}
              />
            </View>
          </>
        )}
      </>
    )
  }

  let body: React.ReactNode
  if (attempt.status === 'pending') {
    body = (
      <View testID="entry-running-loading">
        <LoadingBlock variant="block" message={t('socialRecovery.loading.attempt')} />
      </View>
    )
  } else if (attempt.status === 'failed') {
    body = failed('entry-running-failed')
  } else if (attempt.status === 'ended') {
    body = line(t(`${RUNNING}.ended`), 'entry-running-ended')
  } else if (attempt.status === 'answered') {
    const { date } = renderDateTimeInZone(attempt.value.consumableAfter * 1000, timeZone)
    body = (
      <>
        {refreshFailed && failed('entry-running-refresh-failed')}
        {refreshing && (
          <View testID="entry-running-refreshing" style={spacings.mbTy}>
            <RefreshingLine messageKey="socialRecovery.loading.refreshingAttempt" />
          </View>
        )}
        {line(t(`${RUNNING}.lead`, { date }), 'entry-running-lead')}
        {opening.status === 'pending' &&
          line(t('socialRecovery.watcher.banner.newKeyPending'), 'entry-running-key-pending', true)}
        {opening.status === 'failed' && failed('entry-running-opening-failed')}
        {opening.status === 'answered' && (
          <View style={spacings.mbTy}>
            <Text fontSize={12} appearance="secondaryText">
              {renderValueLabel('newKey', t)}
            </Text>
            <Text fontSize={14} weight="number_medium" selectable testID="entry-running-key">
              {renderFullAddress(opening.value.newKey)}
            </Text>
          </View>
        )}
        {opening.status === 'answered' && entries.status === 'pending' && (
          <View testID="entry-running-entries-loading">
            <LoadingBlock variant="row" message={t('socialRecovery.loading.entries')} />
          </View>
        )}
        {opening.status === 'answered' &&
          entries.status === 'failed' &&
          failed('entry-running-entries-failed')}
        {opening.status === 'answered' && entries.status === 'answered' && whose()}
      </>
    )
  }

  return (
    <SectionCard testID="entry-running">
      <Text fontSize={16} weight="medium" style={spacings.mbTy} testID="entry-running-title">
        {t(`${RUNNING}.title`)}
      </Text>
      {body}
    </SectionCard>
  )
}

export default React.memo(RunningAttemptBandView)
