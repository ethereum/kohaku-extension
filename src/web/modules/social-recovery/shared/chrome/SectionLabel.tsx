import React from 'react'

import Text from '@common/components/Text'
import spacings from '@common/styles/spacings'

import type { SectionLabelProps } from './types'

const SectionLabel = ({ children, testID }: SectionLabelProps) => (
  <Text
    fontSize={12}
    weight="semiBold"
    appearance="secondaryText"
    style={spacings.mbTy}
    testID={testID}
  >
    {children}
  </Text>
)

export default React.memo(SectionLabel)
