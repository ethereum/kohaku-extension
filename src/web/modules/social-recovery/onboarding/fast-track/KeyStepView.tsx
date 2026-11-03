/**
 * Step 3 of 3: the new key and its recovery phrase. The words show in order
 * over the only-backup warning, with the paper line beside them; the key that will control
 * the account shows as an address, never as a field. Continue stays disabled
 * until the holder confirms the words are written down, and while the wallet
 * adds the account, beside a line that says the wallet adds it; Back is
 * disabled while the add runs, until its limit passes with no answer.
 */
import React from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import Checkbox from '@common/components/Checkbox'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import {
  FAST_TRACK_STEP_COUNTER_KEY,
  FAST_TRACK_STEPS
} from '@web/modules/social-recovery/onboarding/recover'
import {
  ActionsRow,
  PageTitle,
  SectionCard,
  StepCounter,
  TwoColumn
} from '@web/modules/social-recovery/shared/chrome'
import LoadingBlock from '@web/modules/social-recovery/shared/chrome/LoadingBlock'
import { renderFullAddress } from '@web/modules/social-recovery/shared/display'

import { KEY_STEP } from './constants'
import type { KeyStepViewProps } from './types'

const KEY = 'socialRecovery.fastTrack.key'

const WORD_CELL = { width: '33.33%' } as const

const KeyStepView = ({
  phase,
  words,
  controllingKey,
  acknowledged,
  onAcknowledge,
  onContinue,
  onRetry,
  pending,
  onBack
}: KeyStepViewProps) => {
  const { t } = useTranslation()
  const { theme } = useTheme()

  const failure = (testID: string) => (
    <View testID={testID} style={spacings.mbLg}>
      <Alert type="error" size="sm" text={t(`${KEY}.createFailed`)}>
        <Button
          testID="fast-track-key-retry"
          type="secondary"
          size="small"
          text={t('socialRecovery.writes.tryAgain')}
          onPress={onRetry}
          hasBottomSpacing={false}
          style={[flexbox.alignSelfStart, spacings.mtSm]}
        />
      </Alert>
    </View>
  )

  const counter = (
    <StepCounter
      labelKey={FAST_TRACK_STEP_COUNTER_KEY}
      step={KEY_STEP}
      total={FAST_TRACK_STEPS}
      testID="fast-track-key-step"
    />
  )
  const backButton = (disabled: boolean) => (
    <Button
      testID="fast-track-key-back"
      type="outline"
      text={t('socialRecovery.ceremony.backAction')}
      disabled={disabled}
      onPress={onBack}
      hasBottomSpacing={false}
    />
  )
  const title = <PageTitle title={t(`${KEY}.title`)} titleTestID="fast-track-key-title" />
  const pendingLine = pending && (
    <View testID="fast-track-key-pending" style={spacings.mbLg}>
      <Alert type="warning" size="sm" text={t(`${KEY}.addPending`)} />
    </View>
  )

  if (phase === 'creating' || phase === 'createFailed' || !words.length || !controllingKey) {
    return (
      <TwoColumn testID="fast-track-key-columns">
        <View testID="fast-track-key">
          {counter}
          {title}
          {phase === 'createFailed' && failure('fast-track-key-create-failed')}
          {phase === 'addFailed' && failure('fast-track-key-add-failed')}
          {phase !== 'createFailed' && phase !== 'addFailed' && (
            <View testID="fast-track-key-waiting" style={spacings.mbLg}>
              {phase === 'creating' ? (
                <View testID="fast-track-key-creating">
                  <LoadingBlock variant="block" message={t(`${KEY}.creating`)} />
                </View>
              ) : (
                <View testID="fast-track-key-adding">
                  <LoadingBlock
                    variant="block"
                    message={t('socialRecovery.loading.addingAccount')}
                  />
                </View>
              )}
            </View>
          )}
          {pendingLine}
          <ActionsRow
            testID="fast-track-key-actions"
            primary={backButton(phase === 'adding' && !pending)}
          />
        </View>
      </TwoColumn>
    )
  }

  const adding = phase === 'adding' || phase === 'listed'

  const aside = (
    <>
      <SectionCard
        tone="muted"
        spacing="item"
        label={t(`${KEY}.created`)}
        testID="fast-track-key-created"
      >
        <Text fontSize={12} appearance="secondaryText">
          {t(`${KEY}.sameAddress`)}
        </Text>
      </SectionCard>
      <SectionCard
        tone="muted"
        spacing="item"
        label={t(`${KEY}.whereToKeep`)}
        testID="fast-track-key-paper"
      >
        <Text fontSize={12} appearance="secondaryText">
          {t(`${KEY}.paper`)}
        </Text>
      </SectionCard>
    </>
  )

  return (
    <TwoColumn testID="fast-track-key-columns" aside={aside}>
      <View testID="fast-track-key">
        {counter}
        {title}

        <SectionCard
          label={t(`${KEY}.keyLabel`)}
          spacing="item"
          testID="fast-track-key-controlling"
        >
          <Text
            fontSize={14}
            weight="number_medium"
            selectable
            style={spacings.mbTy}
            testID="fast-track-key-address"
          >
            {renderFullAddress(controllingKey)}
          </Text>
          <Text fontSize={12} appearance="secondaryText">
            {t(`${KEY}.installs`)}
          </Text>
        </SectionCard>

        <View
          testID="fast-track-key-words"
          style={[
            flexbox.directionRow,
            flexbox.wrap,
            common.borderRadiusPrimary,
            spacings.mbSm,
            { borderWidth: 1, borderColor: theme.secondaryBorder }
          ]}
        >
          {words.map((word, index) => (
            <View
              // A phrase's words are fixed in number and order.
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              style={[WORD_CELL, spacings.phSm, spacings.pvTy, flexbox.directionRow]}
            >
              <Text fontSize={12} appearance="tertiaryText" style={spacings.mrTy}>
                {`${index + 1}.`}
              </Text>
              <Text fontSize={14} weight="medium" testID={`fast-track-key-word-${index}`}>
                {word}
              </Text>
            </View>
          ))}
        </View>
        <Text fontSize={14} style={spacings.mbSm} testID="fast-track-key-only-backup">
          {t(`${KEY}.onlyBackup`, { count: words.length })}
        </Text>

        <Checkbox
          testID="fast-track-key-acknowledge"
          value={acknowledged}
          onValueChange={onAcknowledge}
          label={t(`${KEY}.acknowledge`)}
          labelProps={{ fontSize: 14, weight: 'medium' }}
          style={spacings.mtSm}
        />

        {phase === 'addFailed' && failure('fast-track-key-add-failed')}
        {pendingLine}
        {adding && (
          <View testID="fast-track-key-adding-line" style={spacings.mbSm}>
            <LoadingBlock variant="row" message={t('socialRecovery.loading.addingAccount')} />
          </View>
        )}

        <ActionsRow
          testID="fast-track-key-actions"
          primary={
            <Button
              testID="fast-track-key-continue"
              type="primary"
              text={t(`${KEY}.action`)}
              disabled={!acknowledged || adding}
              onPress={onContinue}
              hasBottomSpacing={false}
            />
          }
          secondary={backButton(adding && !pending)}
        />
      </View>
    </TwoColumn>
  )
}

export default React.memo(KeyStepView)
