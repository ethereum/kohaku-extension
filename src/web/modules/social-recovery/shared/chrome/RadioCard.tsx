import React from 'react'
import { Pressable, View } from 'react-native'

import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'

import type { RadioCardProps } from './types'

const RadioCard = ({ selected, onPress, disabled, testID, children }: RadioCardProps) => {
  const { theme } = useTheme()

  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      disabled={disabled}
      // The web renderer reads the checked state of a radio from this prop
      // alone; the React Native types do not declare it, so it goes in a spread.
      {...{ accessibilityChecked: selected }}
      onPress={onPress}
      style={[
        flexbox.directionRow,
        flexbox.alignStart,
        common.borderRadiusPrimary,
        spacings.ph,
        spacings.pvSm,
        spacings.mbSm,
        {
          borderWidth: 1,
          borderColor: selected ? theme.primary : theme.secondaryBorder,
          ...(selected ? { backgroundColor: theme.secondaryBackground } : {})
        }
      ]}
    >
      <View
        style={[
          flexbox.alignCenter,
          flexbox.justifyCenter,
          spacings.mrSm,
          {
            width: 16,
            height: 16,
            borderRadius: 50,
            borderWidth: 2,
            borderColor: selected ? theme.primary : theme.primaryBorder
          }
        ]}
      >
        {selected && (
          <View
            style={{ width: 10, height: 10, borderRadius: 50, backgroundColor: theme.primary }}
          />
        )}
      </View>
      <View style={flexbox.flex1}>{children}</View>
    </Pressable>
  )
}

export default React.memo(RadioCard)
