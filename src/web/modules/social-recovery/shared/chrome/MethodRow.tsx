import React from 'react'
import { View } from 'react-native'

import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'

import type { MethodRowProps } from './types'

const MethodRow = ({ children, quiet, style, testID }: MethodRowProps) => {
  const { theme } = useTheme()

  return (
    <View
      testID={testID}
      style={[
        common.borderRadiusPrimary,
        spacings.phSm,
        spacings.pvSm,
        spacings.mbTy,
        {
          borderWidth: 1,
          borderColor: quiet ? theme.secondaryBorder : theme.primaryBorder
        },
        style
      ]}
    >
      {children}
    </View>
  )
}

export default React.memo(MethodRow)
