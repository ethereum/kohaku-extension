/**
 * The acknowledgment: the box takes only a call the guardian placed on a
 * number they already had, and the sentence under it says so.
 */
import React from 'react'

import Checkbox from '@common/components/Checkbox'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { SectionCard } from '@web/modules/social-recovery/shared/chrome'

import type { AcknowledgmentBoxProps } from './types'

const ACKNOWLEDGMENT = 'socialRecovery.guardianPage.acknowledgment'

const AcknowledgmentBox = ({ acknowledged, onAcknowledged }: AcknowledgmentBoxProps) => {
  const { t } = useTranslation()

  return (
    <SectionCard testID="guardian-acknowledgment">
      <Checkbox
        testID="guardian-acknowledge"
        value={acknowledged}
        onValueChange={onAcknowledged}
        label={t(`${ACKNOWLEDGMENT}.label`)}
        labelProps={{ fontSize: 14, weight: 'medium' }}
      />
      <Text fontSize={12} style={spacings.mtTy} testID="guardian-acknowledgment-call-rule">
        {t(`${ACKNOWLEDGMENT}.callRule`)}
      </Text>
    </SectionCard>
  )
}

export default React.memo(AcknowledgmentBox)
