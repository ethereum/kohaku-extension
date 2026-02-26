import React from 'react'
import { View, StyleSheet } from 'react-native'
import Svg, { Defs, Rect, SvgProps, Use, Pattern, Image } from 'react-native-svg'

interface Props extends SvgProps {
  width?: number
  height?: number
  isActive?: boolean
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f2f2f7',
    borderRadius: 9999, // 50% equivalent
    justifyContent: 'center',
    alignItems: 'center'
  }
})

const PrivacyIcon: React.FC<Props> = ({ width = 26, height = 26, isActive }) => {
  const padding = 4 // Padding around the SVG
  const containerSize = width + padding * 2 // Adding padding on all sides

  return (
    <View style={[styles.container, { width: containerSize, height: containerSize }]}>
      {isActive ? (
        <Svg width={width} height={height} viewBox="0 0 12 10" fill="none">
          <Rect width="12" height="10" fill="url(#pattern0_135_1392)" />
          <Defs>
            <Pattern
              id="pattern0_135_1392"
              patternContentUnits="objectBoundingBox"
              width="1"
              height="1"
            >
              <Use
                href="#image0_135_1392"
                transform="matrix(0.00634921 0 0 0.00793651 0.166667 -0.00793651)"
              />
            </Pattern>
            <Image
              id="image0_135_1392"
              width="126"
              height="128"
              preserveAspectRatio="none"
              href="data:image/png;base64,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"
            />
          </Defs>
        </Svg>
      ) : (
        <Svg width={width} height={height} viewBox="0 0 12 10" fill="none">
          <Rect width="12" height="10" fill="url(#pattern0_135_1392)" />
          <Defs>
            <Pattern
              id="pattern0_135_1392"
              patternContentUnits="objectBoundingBox"
              width="1"
              height="1"
            >
              <Use
                href="#image0_135_1392"
                transform="matrix(0.00634921 0 0 0.00793651 0.166667 -0.00793651)"
              />
            </Pattern>
            <Image
              id="image0_135_1392"
              width="126"
              height="128"
              preserveAspectRatio="none"
              href="data:image/png;base64,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"
            />
          </Defs>
        </Svg>
      )}
    </View>
  )
}

export default PrivacyIcon
