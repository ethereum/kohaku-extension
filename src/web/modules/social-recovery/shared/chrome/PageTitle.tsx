import React from 'react'
import { View } from 'react-native'

import Text from '@common/components/Text'
import spacings from '@common/styles/spacings'

import type { PageTitleProps } from './types'

const PageTitle = ({ title, lead, titleTestID, children, testID }: PageTitleProps) => (
  <View testID={testID} style={spacings.mbLg}>
    <Text
      fontSize={20}
      weight="medium"
      testID={titleTestID}
      style={lead || children ? spacings.mbTy : undefined}
    >
      {title}
    </Text>
    {!!lead && (
      <Text fontSize={14} appearance="secondaryText">
        {lead}
      </Text>
    )}
    {children}
  </View>
)

export default React.memo(PageTitle)
