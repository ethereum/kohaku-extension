import useTheme from '@common/hooks/useTheme'
import React, { useMemo, useRef } from 'react'
import { Animated, Pressable, StyleProp, ViewStyle } from 'react-native'
import { getStyles, getSwitchColors } from './styles'

interface SwitchProps {
  isOn: boolean
  onToggle: (value: boolean) => void
  width?: number
  height?: number
  disabled?: boolean
  style?: StyleProp<ViewStyle>
}

const WIDTH = 48
const HEIGHT = 26

export const Switch: React.FC<SwitchProps> = ({
  isOn,
  onToggle,
  width = WIDTH,
  height = HEIGHT,
  disabled = false,
  style
}) => {
  const { theme, themeType } = useTheme(getStyles)

  const colors = useMemo(() => ({ ...getSwitchColors(themeType) }), [themeType])

  const styles = useMemo(() => getStyles(theme, themeType, colors), [theme, themeType, colors])

  const thumbSize = height - 8
  const thumbOffset = width - thumbSize - 6

  const animation = useRef(new Animated.Value(isOn ? 1 : 0)).current

  const handlePress = () => {
    if (disabled) return
    const next = !isOn
    Animated.spring(animation, {
      toValue: next ? 1 : 0,
      useNativeDriver: false,
      bounciness: 6,
      speed: 18
    }).start()
    onToggle(next)
  }

  const thumbTranslateX = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [3, thumbOffset]
  })

  const trackColor = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.trackColorOff, colors.trackColorOn]
  })

  const borderColor = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.borderColorOff, colors.borderColorOn]
  })

  const thumbScale = animation.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0.88, 1]
  })

  const shadowOpacity = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.25, 0.55]
  })

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="switch"
      accessibilityState={{ checked: isOn, disabled }}
      style={({ pressed }) => [
        styles.pressable,
        pressed && { opacity: 0.9 },
        disabled && { opacity: 0.45 },
        style
      ]}
    >
      <Animated.View
        style={[
          styles.track,
          {
            width,
            height,
            borderRadius: height / 2,
            backgroundColor: trackColor,
            borderColor
          }
        ]}
      >
        <Animated.View
          style={[
            styles.thumb,
            {
              width: thumbSize,
              height: thumbSize,
              borderRadius: thumbSize / 2,
              transform: [{ translateX: thumbTranslateX }, { scale: thumbScale }],
              shadowOpacity
            }
          ]}
        />
      </Animated.View>
    </Pressable>
  )
}

export default Switch
