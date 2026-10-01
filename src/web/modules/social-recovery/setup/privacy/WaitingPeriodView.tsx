/**
 * The waiting period step: the four chips and the custom entry in whole hours,
 * 48 hours unless a waiting period is stored, what the wait is for and what
 * the cancel costs. Continue stores the length in seconds and opens the
 * privacy step.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, View } from 'react-native'

import Button from '@common/components/Button'
import Input from '@common/components/Input'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import { renderNoun } from '@web/modules/social-recovery/shared/display'

import type { WaitChoice, WaitingPeriodViewProps } from './types'
import {
  choiceOfSeconds,
  DEFAULT_CHOICE,
  hoursOfChoice,
  isChipPastCeiling,
  PICKER_CEILING_HOURS,
  readCustomWait,
  secondsOfHours,
  WAIT_CHIPS
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
  const { theme } = useTheme()

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

  const chipStyle = (selected: boolean) => [
    spacings.phSm,
    spacings.pvTy,
    spacings.mrSm,
    spacings.mbSm,
    common.borderRadiusPrimary,
    { borderWidth: 1, borderColor: selected ? theme.primary : theme.secondaryBorder }
  ]

  return (
    <View testID="waiting-period-screen">
      <Text fontSize={20} weight="medium" style={spacings.mbSm}>
        {renderNoun('waitingPeriod', t)}
      </Text>
      <Text fontSize={14} style={spacings.mbLg}>
        {t(`${WAIT}.lead`)}
      </Text>
      {loadFailed && (
        <Text testID="load-failed" fontSize={14} appearance="errorText" style={spacings.mbSm}>
          {t('socialRecovery.records.loadFailed')}
        </Text>
      )}
      <Text fontSize={14} weight="medium">
        {t(`${WAIT}.fieldLabel`)}
      </Text>
      <Text fontSize={12} appearance="secondaryText" style={spacings.mbSm}>
        {t(`${WAIT}.onePerPath`)}
      </Text>
      <View style={[flexbox.directionRow, flexbox.wrap]}>
        {WAIT_CHIPS.map((chip) => {
          const { id } = chip
          const selected = choice.kind === 'chip' && choice.id === id
          return (
            <Pressable
              key={id}
              testID={`wait-chip-${id}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              disabled={!loaded || isChipPastCeiling(chip, ceilingHours)}
              // The web renderer reads the checked state of a radio from this prop
              // alone; the React Native types do not declare it, so it goes in a spread.
              {...{ accessibilityChecked: selected }}
              onPress={() => setChoice({ kind: 'chip', id })}
              style={chipStyle(selected)}
            >
              <Text fontSize={14}>{t(`${WAIT}.chips.${id}`)}</Text>
            </Pressable>
          )
        })}
        <Pressable
          testID="wait-chip-custom"
          accessibilityRole="radio"
          accessibilityState={{ checked: choice.kind === 'custom' }}
          disabled={!loaded}
          {...{ accessibilityChecked: choice.kind === 'custom' }}
          onPress={() => choice.kind !== 'custom' && setChoice({ kind: 'custom', text: '' })}
          style={chipStyle(choice.kind === 'custom')}
        >
          <Text fontSize={14}>{t(`${WAIT}.custom`)}</Text>
        </Pressable>
      </View>
      {choice.kind === 'custom' && (
        <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mbTy]}>
          <Input
            testID="wait-custom-hours"
            value={choice.text}
            keyboardType="number-pad"
            disabled={!loaded}
            onChangeText={(typed) => setChoice({ kind: 'custom', text: typed })}
            containerStyle={{ ...spacings.mb0, ...spacings.mrSm }}
          />
          <Text fontSize={14}>{t(`${WAIT}.customUnit`)}</Text>
        </View>
      )}
      {custom?.status === 'notWholeHours' && (
        <Text testID="wait-refusal" fontSize={14} appearance="errorText" style={spacings.mbTy}>
          {t(`${WAIT}.wholeHours`)}
        </Text>
      )}
      {custom?.status === 'belowMinimum' && (
        <Text testID="wait-refusal" fontSize={14} appearance="errorText" style={spacings.mbTy}>
          {t(`${WAIT}.belowMinimum`)}
        </Text>
      )}
      {pastCeiling && (
        <Text testID="wait-refusal" fontSize={14} appearance="errorText" style={spacings.mbTy}>
          {t(`${WAIT}.pastCeiling`, { hours: ceilingHours })}
        </Text>
      )}
      <Text fontSize={12} appearance="secondaryText" style={spacings.mbLg}>
        {t(`${WAIT}.minimumDefault`)}
      </Text>
      <Text fontSize={12} weight="medium" appearance="secondaryText" style={spacings.mbSm}>
        {t(`${WAIT}.whatForHeader`)}
      </Text>
      <Text testID="notice-window" fontSize={14} style={spacings.mbTy}>
        {t(`${WAIT}.noticeWindow`)}
      </Text>
      <Text fontSize={14} style={spacings.mbTy}>
        {t(`${WAIT}.nothingElseWatches`)}
      </Text>
      <Text testID="cancel-cost" fontSize={14} style={spacings.mbLg}>
        {t('socialRecovery.costLines.cancel')}
      </Text>
      {writeFailed && (
        <Text testID="write-failed" fontSize={14} appearance="errorText" style={spacings.mbSm}>
          {t('socialRecovery.records.writeFailed')}
        </Text>
      )}
      <View style={[flexbox.directionRow, spacings.mtSm]}>
        <Button
          testID="back"
          type="outline"
          text={t('socialRecovery.ceremony.backAction')}
          disabled={busy}
          onPress={() => navigate(WEB_ROUTES.socialRecoverySetupEditor)}
          style={spacings.mrSm}
        />
        <Button
          testID="continue"
          text={t('socialRecovery.actions.continue')}
          disabled={hours === undefined || busy}
          onPress={onContinue}
        />
      </View>
    </View>
  )
}

export default React.memo(WaitingPeriodView)
