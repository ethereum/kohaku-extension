/**
 * The waiting period step: the four chips, the default one marked inside its
 * pill, and the custom entry in whole hours with its minimum beside it, 48
 * hours unless a waiting period is stored, and what the wait is for beside
 * them. Continue stores the length in seconds and opens the privacy step.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import Input from '@common/components/Input'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import {
  ActionsRow,
  PageTitle,
  PillChoice,
  SectionCard,
  TwoColumn
} from '@web/modules/social-recovery/shared/chrome'
import { renderNoun, renderWaitLength } from '@web/modules/social-recovery/shared/display'

import type { WaitChoice, WaitingPeriodViewProps } from './types'
import {
  choiceOfSeconds,
  CUSTOM_UNIT_IS_MINUTES,
  DEFAULT_CHOICE,
  hoursOfChoice,
  isChipPastCeiling,
  PICKER_CEILING_HOURS,
  readCustomWait,
  secondsOfHours,
  WAIT_CHIPS,
  WAIT_FLOOR_SECONDS
} from './wait'
import { writeWaitingPeriod } from './writes'

const WAIT = 'socialRecovery.privacy.waitingPeriod'

const WaitingPeriodView = ({
  records,
  chainId,
  account,
  navigate,
  ceilingHours = PICKER_CEILING_HOURS
}: WaitingPeriodViewProps) => {
  const { t } = useTranslation()

  const [choice, setChoice] = useState<WaitChoice>(DEFAULT_CHOICE)
  const [loaded, setLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [writeFailed, setWriteFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  const setup = useMemo(() => records.setup(chainId, account), [records, chainId, account])

  useEffect(() => {
    let current = true
    setLoaded(false)
    // The draft's wait is the one the setup saves; the record stands in only
    // while no draft exists.
    const load = async () => {
      const draft = await setup.setupDraft.read()
      if (draft.status === 'present') {
        return draft.value.wait
      }
      const stored = await setup.waitingPeriod.read()
      return stored.status === 'present' ? stored.value : undefined
    }
    load()
      .then((wait) => {
        if (current && wait !== undefined) {
          setChoice(choiceOfSeconds(wait))
        }
      })
      .catch(() => {
        if (current) {
          setLoadFailed(true)
        }
      })
      .finally(() => {
        if (current) {
          setLoaded(true)
        }
      })
    return () => {
      current = false
    }
  }, [setup])

  // Continue is held until the stored wait is read, so the default never
  // replaces a stored length, and after a failed load, so a storage that
  // comes back is never overwritten with a length the holder did not pick.
  const hours = loaded && !loadFailed ? hoursOfChoice(choice, ceilingHours) : undefined
  const custom = choice.kind === 'custom' ? readCustomWait(choice.text, ceilingHours) : undefined
  // A stored chip past the ceiling stays selected with the custom entry's
  // refusal, and continue stays held until the holder picks another length.
  const pastCeiling =
    choice.kind === 'chip'
      ? WAIT_CHIPS.some((chip) => chip.id === choice.id && isChipPastCeiling(chip, ceilingHours))
      : custom?.status === 'pastCeiling'

  const onContinue = useCallback(async () => {
    if (hours === undefined) {
      return
    }
    setBusy(true)
    try {
      await writeWaitingPeriod(setup, secondsOfHours(hours))
      setWriteFailed(false)
      navigate(WEB_ROUTES.socialRecoverySetupPrivacy)
    } catch {
      setWriteFailed(true)
    } finally {
      setBusy(false)
    }
  }, [setup, hours, navigate])

  const aside = (
    <SectionCard tone="muted" spacing="item" label={t(`${WAIT}.whatForHeader`)}>
      <Text testID="notice-window" fontSize={12} appearance="secondaryText" style={spacings.mbTy}>
        {t(`${WAIT}.noticeWindow`)}
      </Text>
      <Text fontSize={12} appearance="secondaryText">
        {t(`${WAIT}.nothingElseWatches`)}
      </Text>
    </SectionCard>
  )

  return (
    <TwoColumn testID="waiting-period-columns" aside={aside}>
      <View testID="waiting-period-screen">
        <PageTitle title={renderNoun('waitingPeriod', t)} lead={t(`${WAIT}.lead`)} />
        {loadFailed && (
          <Text testID="load-failed" fontSize={14} appearance="errorText" style={spacings.mbSm}>
            {t('socialRecovery.records.loadFailed')}
          </Text>
        )}
        <SectionCard>
          <Text fontSize={16} weight="medium" style={spacings.mbTy}>
            {t(`${WAIT}.fieldLabel`)}
          </Text>
          <Text fontSize={14} style={spacings.mbSm}>
            {t(`${WAIT}.onePerPath`)}
          </Text>
          <View style={[flexbox.directionRow, flexbox.wrap]}>
            {WAIT_CHIPS.map((chip) => {
              const { id } = chip
              const isDefault = DEFAULT_CHOICE.kind === 'chip' && id === DEFAULT_CHOICE.id
              return (
                <PillChoice
                  key={id}
                  testID={`wait-chip-${id}`}
                  label={t(`${WAIT}.chips.${id}`)}
                  mark={isDefault ? t('socialRecovery.privacy.defaultChip') : undefined}
                  markTestID={isDefault ? 'wait-default-chip' : undefined}
                  selected={choice.kind === 'chip' && choice.id === id}
                  disabled={!loaded || isChipPastCeiling(chip, ceilingHours)}
                  onPress={() => setChoice({ kind: 'chip', id })}
                  style={[spacings.mrSm, spacings.mbSm]}
                />
              )
            })}
            <PillChoice
              testID="wait-chip-custom"
              label={t(`${WAIT}.custom`)}
              selected={choice.kind === 'custom'}
              disabled={!loaded}
              onPress={() => choice.kind !== 'custom' && setChoice({ kind: 'custom', text: '' })}
              style={spacings.mbSm}
            />
          </View>
          {choice.kind === 'custom' && (
            <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mbSm]}>
              <Input
                testID="wait-custom-hours"
                value={choice.text}
                keyboardType="number-pad"
                disabled={!loaded}
                onChangeText={(typed) => setChoice({ kind: 'custom', text: typed })}
                containerStyle={{ ...spacings.mb0, ...spacings.mrSm }}
              />
              <Text fontSize={14} style={spacings.mrSm}>
                {t(CUSTOM_UNIT_IS_MINUTES ? `${WAIT}.customUnitMinutes` : `${WAIT}.customUnit`)}
              </Text>
              {custom?.status !== 'belowMinimum' && (
                <Text testID="wait-custom-minimum" fontSize={12} appearance="secondaryText">
                  {t(`${WAIT}.customMinimum`, { minimum: renderWaitLength(WAIT_FLOOR_SECONDS, t) })}
                </Text>
              )}
            </View>
          )}
          {custom?.status === 'notWholeHours' && (
            <Text testID="wait-refusal" fontSize={14} appearance="errorText" style={spacings.mbTy}>
              {t(CUSTOM_UNIT_IS_MINUTES ? `${WAIT}.wholeMinutes` : `${WAIT}.wholeHours`)}
            </Text>
          )}
          {custom?.status === 'belowMinimum' && (
            <Text testID="wait-refusal" fontSize={14} appearance="errorText" style={spacings.mbTy}>
              {t(`${WAIT}.belowMinimum`, { minimum: renderWaitLength(WAIT_FLOOR_SECONDS, t) })}
            </Text>
          )}
          {pastCeiling && (
            <Text testID="wait-refusal" fontSize={14} appearance="errorText" style={spacings.mbTy}>
              {t(`${WAIT}.pastCeiling`, { hours: ceilingHours })}
            </Text>
          )}
        </SectionCard>
        {writeFailed && (
          <Alert
            type="error"
            size="sm"
            style={spacings.mbSm}
            text={
              <Alert.Text size="sm" type="error" testID="write-failed">
                {t('socialRecovery.records.writeFailed')}
              </Alert.Text>
            }
          />
        )}
        <ActionsRow
          primary={
            <Button
              testID="continue"
              text={t('socialRecovery.actions.continue')}
              disabled={hours === undefined || busy}
              onPress={onContinue}
              hasBottomSpacing={false}
            />
          }
          secondary={
            <Button
              testID="back"
              type="outline"
              text={t('socialRecovery.ceremony.backAction')}
              disabled={busy}
              onPress={() => navigate(WEB_ROUTES.socialRecoverySetupEditor)}
              hasBottomSpacing={false}
            />
          }
        />
      </View>
    </TwoColumn>
  )
}

export default React.memo(WaitingPeriodView)
