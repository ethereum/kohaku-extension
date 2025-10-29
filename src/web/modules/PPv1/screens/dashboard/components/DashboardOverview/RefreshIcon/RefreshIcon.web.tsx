import './RefreshIcon.css'

import React, { memo } from 'react'
import { ColorValue, ViewStyle } from 'react-native'

import RefreshSvg from '@common/assets/svg/RefreshIcon'

// We are setting the width and height for both the wrapping div and the SVG.
// Otherwise, the spinning animation breaks.
const RefreshIcon = ({
  color,
  spin,
  width,
  height
}: {
  color?: ColorValue
  spin?: boolean
  width: ViewStyle['width']
  height: ViewStyle['height']
}) => {
  return (
    <div className={spin ? 'spinAnimation' : ''} style={{ width, height }}>
      <RefreshSvg color={color} width={width} height={height} />
    </div>
  )
}

export default memo(RefreshIcon)
