import React, { useState } from 'react'
import { Pressable } from 'react-native'

import Text from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'

import type { KindMenuEntryProps } from './types'

/** One kind in a kind menu, its row lit while the pointer is over it. */
const KindMenuEntry = ({ label, onPress, disabled, testID }: KindMenuEntryProps) => {
  const { theme } = useTheme()
  const [hovered, setHovered] = useState(false)

  return (
    <Pressable
      testID={testID}
      accessibilityRole="menuitem"
      disabled={disabled}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        spacings.phSm,
        spacings.pvTy,
        hovered && !disabled ? { backgroundColor: theme.secondaryBackground } : undefined
      ]}
    >
      <Text fontSize={14}>{label}</Text>
    </Pressable>
  )
}

export default React.memo(KindMenuEntry)
