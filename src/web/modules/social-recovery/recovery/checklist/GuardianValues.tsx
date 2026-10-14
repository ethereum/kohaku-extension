/**
 * A guardian row's value block, two columns: the account, the new key, the
 * key being removed and the payment line, then the setup number and the
 * attempt number the paste check and the approval page read. A value still
 * being read shows a loader; a failed read of the removed key offers retry. A
 * wallet that cannot name the removed key says so, with no retry: another read
 * answers the same, and the carriers stay locked.
 */
import React from 'react'
import { ActivityIndicator, View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { SectionCard } from '@web/modules/social-recovery/shared/chrome'
import { renderNoun } from '@web/modules/social-recovery/shared/display'

import type { GuardianValueName, GuardianValuesProps } from './types'

const LABEL_COLUMN = { width: 140 } as const

const GuardianValues = ({ place, request, block, removed, retryRemoved }: GuardianValuesProps) => {
  const { t } = useTranslation()

  const row = (label: string, value: React.ReactNode, testID: string) => (
    <View key={testID} style={[flexbox.directionRow, flexbox.alignCenter, spacings.mbTy]}>
      <Text fontSize={12} weight="semiBold" appearance="secondaryText" style={LABEL_COLUMN}>
        {label}
      </Text>
      <View style={flexbox.flex1} testID={testID}>
        {value}
      </View>
    </View>
  )

  const valueText = (value: string) => (
    <Text fontSize={14} weight="number_medium" selectable>
      {value}
    </Text>
  )

  const pending = (name: GuardianValueName) => {
    if (name === 'keyBeingRemoved' && removed.status === 'failed') {
      return (
        <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap]}>
          <Text fontSize={12} appearance="errorText" style={spacings.mrSm}>
            {t('socialRecovery.checklist.guardian.removedKeyReadFailed')}
          </Text>
          <Button
            testID={`checklist-row-${place}-removed-retry`}
            type="secondary"
            size="small"
            text={t('socialRecovery.writes.tryAgain')}
            onPress={retryRemoved}
            hasBottomSpacing={false}
          />
        </View>
      )
    }
    if (name === 'keyBeingRemoved' && removed.status === 'unavailable') {
      return (
        <Text
          fontSize={12}
          appearance="errorText"
          testID={`checklist-row-${place}-removed-unavailable`}
        >
          {t('socialRecovery.checklist.guardian.removedKeyUnavailable')}
        </Text>
      )
    }
    if (name === 'keyBeingRemoved' && removed.status === 'loading') {
      return <ActivityIndicator style={flexbox.alignSelfStart} />
    }
    return null
  }

  return (
    <SectionCard
      tone="muted"
      spacing="none"
      testID={`checklist-row-${place}-values`}
      style={spacings.mtSm}
    >
      {block.lines.map((line) =>
        row(
          line.label,
          line.value === null ? pending(line.name) : valueText(line.value),
          `checklist-row-${place}-value-${line.name}`
        )
      )}
      {row(
        renderNoun('setupNumber', t),
        valueText(request.setupNonce),
        `checklist-row-${place}-setup-number`
      )}
      {row(
        renderNoun('attemptNumber', t),
        valueText(request.attemptId),
        `checklist-row-${place}-attempt-number`
      )}
    </SectionCard>
  )
}

export default React.memo(GuardianValues)
