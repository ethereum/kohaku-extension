import './unlock-screen-background.css'

import React from 'react'
import { View } from 'react-native'
import Svg, { ClipPath, Defs, Ellipse, G, Path, Stop, SvgProps } from 'react-native-svg'

import useTheme from '@common/hooks/useTheme'
import { THEME_TYPES } from '@common/styles/themeConfig'
import { isSafari } from '@web/constants/browserapi'

interface Props extends SvgProps {
  width?: number
  height?: number
}

const UnlockScreenBackground: React.FC<Props> = ({ width = 600, height = 360, ...rest }) => {
  const { themeType } = useTheme()
  return (
    <View style={themeType === THEME_TYPES.DARK ? { opacity: 0.55 } : { opacity: 1 }}>
      {!!isSafari() && (
        <View
          style={{
            width: 310,
            height: 360,
            borderRadius: '50%',
            backgroundColor: '#D01C15',
            position: 'absolute',
            zIndex: 5,
            top: -100,
            left: -90
          }}
          nativeID="unlock-screen-background-safari"
        />
      )}
      {!!isSafari() && (
        <View
          style={{
            width: 350,
            height: 440,
            borderRadius: '50%',
            backgroundColor: '#F9F6E9',
            position: 'absolute',
            zIndex: 5,
            bottom: -130,
            right: -150
          }}
          nativeID="unlock-screen-background-safari"
        />
      )}
      <Svg width={width} height={height} viewBox="0 0 600 360" {...rest}>
        <Defs>
          <linearGradient
            id="linear-gradient"
            x1="1"
            x2="0"
            y2="1"
            gradientUnits="objectBoundingBox"
          >
            <Stop offset="0" stopColor="#000000" />
            <Stop offset="1" stopColor="#D01C15" />
          </linearGradient>
          <ClipPath id="clip-path">
            <Path
              d="M0,0H600a0,0,0,0,1,0,0V354a6,6,0,0,1-6,6H6a6,6,0,0,1-6-6V0A0,0,0,0,1,0,0Z"
              transform="translate(799 76)"
              fill="url(#linear-gradient)"
            />
          </ClipPath>
        </Defs>
        <G id="bg" transform="translate(-799 -76)" clipPath="url(#clip-path)">
          <Path
            d="M0,0H600a0,0,0,0,1,0,0V354a6,6,0,0,1-6,6H6a6,6,0,0,1-6-6V0A0,0,0,0,1,0,0Z"
            transform="translate(799 76)"
            fill="url(#linear-gradient)"
          />
          {!isSafari() && (
            <Ellipse
              cx="157.5"
              cy="187.834"
              rx="157.5"
              ry="187.834"
              fill="#D01C15"
              transform="translate(715 -42.984)"
              nativeID="unlock-screen-background"
            />
          )}
          {!isSafari() && (
            <Ellipse
              cx="175.5"
              cy="221.925"
              rx="175.5"
              ry="221.925"
              transform="translate(1217 128.139)"
              fill="#F9F6E9"
              nativeID="unlock-screen-background"
            />
          )}
        </G>
      </Svg>
    </View>
  )
}

export default React.memo(UnlockScreenBackground)
