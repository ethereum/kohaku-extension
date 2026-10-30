/**
 * The page's lead: who asks, the four values in full, and directly under
 * them the instruction to compare the account and the new key with what the
 * owner read on the call.
 */
import React from 'react'
import { View } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { SectionCard } from '@web/modules/social-recovery/shared/chrome'

import type { LeadBlockProps } from './types'
import ValueLines from './ValueLines'

const LEAD = 'socialRecovery.guardianPage.lead'

const LeadBlock = ({ values }: LeadBlockProps) => {
  const { t } = useTranslation()

  return (
    <View testID="guardian-lead">
      <Text fontSize={20} weight="medium" style={spacings.mbTy} testID="guardian-lead-title">
        {t(`${LEAD}.title`)}
      </Text>
      <Text fontSize={14} style={spacings.mbSm} testID="guardian-lead-body">
        {t(`${LEAD}.body`)}
      </Text>
      <SectionCard testID="guardian-values">
        <ValueLines values={values} testID="guardian-value" />
      </SectionCard>
      <Text fontSize={14} weight="medium" style={spacings.mbLg} testID="guardian-lead-compare">
        {t(`${LEAD}.compare`)}
      </Text>
    </View>
  )
}

export default React.memo(LeadBlock)
