import React from 'react'
import { Pressable } from 'react-native'

import Text from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'

import type { PillChoiceProps } from './types'

const PillChoice = ({ label, selected, onPress, disabled, style, testID }: PillChoiceProps) => {
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
        spacings.ph,
        spacings.pvTy,
        {
          borderRadius: 50,
          borderWidth: 1,
          borderColor: selected ? theme.primary : theme.primaryBorder,
          ...(selected ? { backgroundColor: theme.secondaryBackground } : {})
        },
        style
      ]}
    >
      <Text fontSize={14} weight="medium">
        {label}
      </Text>
    </Pressable>
  )
}

export default React.memo(PillChoice)
