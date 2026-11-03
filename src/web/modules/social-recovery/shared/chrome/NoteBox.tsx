import React from 'react'
import { View } from 'react-native'

import Text from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'

import type { NoteBoxProps } from './types'

const NoteBox = ({ children, testID }: NoteBoxProps) => {
  const { theme } = useTheme()

  return (
    <View
      testID={testID}
      style={[
        common.borderRadiusPrimary,
        spacings.phSm,
        spacings.pvSm,
        {
          borderWidth: 1,
          borderColor: theme.secondaryBorder,
          backgroundColor: theme.secondaryBackground
        }
      ]}
    >
      <Text fontSize={12} appearance="secondaryText">
        {children}
      </Text>
    </View>
  )
}

export default React.memo(NoteBox)
