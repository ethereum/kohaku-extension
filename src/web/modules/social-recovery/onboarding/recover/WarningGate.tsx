/**
 * The warning every recovery entry shows before it takes any input: no
 * support agent ever asks a holder to start a recovery. Continue stays
 * disabled until the holder ticks the acknowledgment; the condensed form draws
 * no continue and reports the acknowledgment to the screen that hosts it.
 * Nothing remembers it: every mount takes its own.
 */
import React, { useCallback, useState } from 'react'
import { View } from 'react-native'

import Checkbox from '@common/components/Checkbox'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { SectionCard, StepCounter } from '@web/modules/social-recovery/shared/chrome'

import { FAST_TRACK_STEP_COUNTER_KEY, FAST_TRACK_STEPS, WARNING_STEP } from './constants'
import { warningCopyOf } from './copy'
import type { WarningGateProps } from './types'
import WarningActions from './WarningActions'
import WarningHeader from './WarningHeader'
import WarningImportPointer from './WarningImportPointer'

const WarningGate = ({ form, testID = 'recovery-warning', ...handlers }: WarningGateProps) => {
  const { t } = useTranslation()
  const [acknowledged, setAcknowledged] = useState(false)
  const copy = warningCopyOf(form)

  const onContinue = 'onContinue' in handlers ? handlers.onContinue : null
  const onLeave = 'onLeave' in handlers ? handlers.onLeave : null
  const onImportInstead = 'onImportInstead' in handlers ? handlers.onImportInstead : null
  const onAcknowledgedChange =
    'onAcknowledgedChange' in handlers ? handlers.onAcknowledgedChange : null

  const acknowledge = useCallback(
    (value: boolean) => {
      setAcknowledged(value)
      onAcknowledgedChange?.(value)
    },
    [onAcknowledgedChange]
  )

  const proceed = useCallback(() => {
    if (!acknowledged || !onContinue) {
      return
    }
    onContinue()
  }, [acknowledged, onContinue])

  return (
    <View testID={testID}>
      {copy.counter && (
        <StepCounter
          labelKey={FAST_TRACK_STEP_COUNTER_KEY}
          step={WARNING_STEP}
          total={FAST_TRACK_STEPS}
          testID={`${testID}-step`}
        />
      )}
      {!!copy.header && <WarningHeader header={copy.header} testID={testID} />}
      <Text
        fontSize={16}
        weight="medium"
        appearance="errorText"
        style={spacings.mbSm}
        testID={`${testID}-lead`}
      >
        {t(copy.lead)}
      </Text>

      <SectionCard spacing="item" testID={`${testID}-lines`}>
        {copy.lines.map((line) => (
          <Text key={line} fontSize={14} style={spacings.mbTy}>
            {t(line)}
          </Text>
        ))}
      </SectionCard>

      {!!copy.pointer && !!onImportInstead && (
        <WarningImportPointer
          pointer={copy.pointer}
          onImportInstead={onImportInstead}
          testID={testID}
        />
      )}

      <Checkbox
        testID={`${testID}-acknowledge`}
        value={acknowledged}
        onValueChange={acknowledge}
        label={t(copy.acknowledge)}
        labelProps={{ fontSize: 14, weight: 'medium' }}
        style={spacings.mtSm}
      />

      {copy.actions && !!onContinue && (
        <WarningActions
          acknowledged={acknowledged}
          onContinue={proceed}
          onLeave={onLeave}
          testID={testID}
        />
      )}
    </View>
  )
}

export default React.memo(WarningGate)
