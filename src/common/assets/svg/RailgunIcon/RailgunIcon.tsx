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

const RailgunIcon: React.FC<Props> = ({ width = 26, height = 26, isActive }) => {
  const padding = 4 // Padding around the SVG
  const containerSize = width + padding * 2 // Adding padding on all sides

  return (
    <View style={[styles.container, { width: containerSize, height: containerSize }]}>
      <Svg width={width} height={height} viewBox="0 0 28 28" fill="none">
        <Rect width="28" height="28" fill="url(#pattern0_railgun_icon)" />
        <Defs>
          <Pattern
            id="pattern0_railgun_icon"
            patternContentUnits="objectBoundingBox"
            width="1"
            height="1"
          >
            <Use
              href="#image0_railgun_icon"
              transform="matrix(0.0357143 0 0 0.0357143 0 0)"
            />
          </Pattern>
          <Image
            id="image0_railgun_icon"
            width="28"
            height="28"
            preserveAspectRatio="none"
            href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAYAAAByDd+UAAAAxElEQVR4AWJwL/ChKx7GFo5aKCUtC2i3DG4ABGEoenMDhugMnYMNuoGLePRiXMUZHMMltCaY/DSREKSeOLwDUPJSoEBUZmV6QZTQUnjLzgKkSqgTSRkVSWwZyWHasUYoGYGFbkB8uAuffca+miWVQkKawyBk97JQyQrC8PWUDkrIMIFs/6MsEPpLuMFSNhVygkx9sstNY/rJ7p1HhgOOmSyjv9Bm6S0sytJByHiZtxAuL0KM2SFGmj3AGSFBzNj/NF3owgVFQhkunrN1ywAAAABJRU5ErkJggg=="
          />
        </Defs>
      </Svg>
    </View>
  )
}

export default RailgunIcon
