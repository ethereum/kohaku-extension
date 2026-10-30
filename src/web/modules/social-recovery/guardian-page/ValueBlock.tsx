/**
 * The value block of the signing step and the offline block: the four values
 * the lead carries, the request's deadline beside them with its time left,
 * and the sentence that anyone holding the request can submit it until the
 * deadline passes, so the guardian reads all of it at the act it guards.
 */
import React from 'react'
import { View } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { SectionCard, SectionLabel } from '@web/modules/social-recovery/shared/chrome'
import { renderValueLabel } from '@web/modules/social-recovery/shared/display'

import type { ValueBlockProps } from './types'
import ValueLines from './ValueLines'

const ValueBlock = ({ values, deadline, testID }: ValueBlockProps) => {
  const { t } = useTranslation()

  return (
    <SectionCard testID={testID}>
      <ValueLines values={values} testID={`${testID}-value`} />
      {!!deadline && (
        <View style={[spacings.phSm, spacings.mbTy]}>
          <SectionLabel>{renderValueLabel('deadline', t)}</SectionLabel>
          <Text fontSize={14} weight="number_medium" testID={`${testID}-deadline`}>
            {deadline.line}
          </Text>
        </View>
      )}
      <Text fontSize={12} style={spacings.phSm} testID={`${testID}-submittable`}>
        {t('socialRecovery.checklist.submittable')}
      </Text>
    </SectionCard>
  )
}

export default React.memo(ValueBlock)
