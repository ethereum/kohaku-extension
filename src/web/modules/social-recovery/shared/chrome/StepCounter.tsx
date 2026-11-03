import React from 'react'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'

import type { StepCounterProps } from './types'

const StepCounter = ({ labelKey, step, total, testID }: StepCounterProps) => {
  const { t } = useTranslation()

  return (
    <Text
      fontSize={12}
      weight="semiBold"
      appearance="secondaryText"
      style={spacings.mbSm}
      testID={testID}
    >
      {t(labelKey, { step, total })}
    </Text>
  )
}

export default React.memo(StepCounter)
