/**
 * The acknowledgment and the two actions. The box takes only a call the
 * guardian placed on a number they already had, and the two sentences beside
 * it say so. Sign stays disabled until every gate holds; under it, while the
 * box is not ticked, the line that asks for the tick. Decline is always open.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Checkbox from '@common/components/Checkbox'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { SectionCard } from '@web/modules/social-recovery/shared/chrome'

import type { SignBlockProps } from './types'

const PAGE = 'socialRecovery.guardianPage'

const SignBlock = ({ acknowledged, onAcknowledged, enabled, onDecline }: SignBlockProps) => {
  const { t } = useTranslation()

  return (
    <View testID="guardian-sign-block">
      <SectionCard testID="guardian-acknowledgment">
        <Checkbox
          testID="guardian-acknowledge"
          value={acknowledged}
          onValueChange={onAcknowledged}
          label={t(`${PAGE}.acknowledgment.label`)}
          labelProps={{ fontSize: 14, weight: 'medium' }}
        />
        <Text fontSize={12} style={spacings.mtTy} testID="guardian-acknowledgment-own-number">
          {t(`${PAGE}.acknowledgment.ownNumber`)}
        </Text>
        <Text
          fontSize={12}
          appearance="secondaryText"
          style={spacings.mtTy}
          testID="guardian-acknowledgment-received"
        >
          {t(`${PAGE}.acknowledgment.received`)}
        </Text>
      </SectionCard>
      <Button
        testID="guardian-sign"
        type="primary"
        text={t(`${PAGE}.actions.sign`)}
        disabled={!enabled}
        hasBottomSpacing={false}
        style={spacings.mbTy}
      />
      {!acknowledged && (
        <Text
          fontSize={12}
          appearance="secondaryText"
          style={spacings.mbSm}
          testID="guardian-tick-first"
        >
          {t(`${PAGE}.acknowledgment.tickFirst`)}
        </Text>
      )}
      <Button
        testID="guardian-decline"
        type="secondary"
        text={t(`${PAGE}.actions.decline`)}
        onPress={onDecline}
        hasBottomSpacing={false}
      />
    </View>
  )
}

export default React.memo(SignBlock)
