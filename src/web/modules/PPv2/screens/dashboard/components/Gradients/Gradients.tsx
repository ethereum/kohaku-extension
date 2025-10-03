import React, { useEffect, useRef } from 'react'
import { Animated } from 'react-native'

import useTheme from '@common/hooks/useTheme'
import { getAvatarColors } from '@common/utils/avatars'
import { getUiType } from '@web/utils/uiType'

import Gradient from './Gradient/Gradient.web'

export function shadeColor(color: string, amount: number) {
  return `#${color
    .replace(/^#/, '')
    .replace(/../g, (colorToReplace: string) =>
      `0${Math.min(255, Math.max(0, parseInt(colorToReplace, 16) + amount)).toString(16)}`.substr(
        -2
      )
    )}`
}

const { isTab } = getUiType()

const ANIMATION_STEPS = [
  {
    left: 0.25,
    top: -0.5
  },
  {
    left: 0.5,
    top: -0.25
  },
  {
    left: 0.75,
    top: 0.25
  },
  {
    left: 0.5,
    top: 0
  },
  {
    left: 0.25,
    top: -0.25
  },
  {
    left: 0,
    top: 0
  }
]

const Gradients = ({
  width,
  height,
  selectedAccount
}: {
  width: number
  height: number
  selectedAccount: string | null
}) => {
  const avatarColors = getAvatarColors(selectedAccount || '')
  const left = useRef(new Animated.Value(0)).current
  const top = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.sequence(
          ANIMATION_STEPS.map(({ left: _left }) => {
            return Animated.timing(left, {
              toValue: width * _left,
              duration: isTab ? 10000 : 7500,
              useNativeDriver: true
            })
          })
        ),
        Animated.sequence(
          ANIMATION_STEPS.map(({ top: _top }) =>
            Animated.timing(top, {
              toValue: height * _top,
              duration: isTab ? 10000 : 7500,
              useNativeDriver: true
            })
          )
        )
      ])
    ).start()
  }, [left, width, height, top])

  const scaleInterpolate = left.interpolate({
    inputRange: [0, width],
    outputRange: [1, 0.6]
  })

  return (
    <>
      <Animated.View
        style={{
          position: 'absolute',
          top,
          left,
          zIndex: 1,
          width: width / 2,
          height: height * 2,
          transform: [{ scale: scaleInterpolate }]
        }}
      >
        <Gradient
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: shadeColor(avatarColors[0], -90)
          }}
        />
      </Animated.View>
      <Animated.View
        style={{
          position: 'absolute',
          top: top.interpolate({
            inputRange: [0, height],
            outputRange: [100, height]
          }),
          left: left.interpolate({
            inputRange: [0, width],
            outputRange: [-100, width]
          }),
          zIndex: 1,

          width: width / 3,
          height: height * 1.5,
          transform: [{ scale: scaleInterpolate }]
        }}
      >
        <Gradient
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: shadeColor(avatarColors[1], 40)
          }}
        />
      </Animated.View>
    </>
  )
}

export default React.memo(Gradients)
