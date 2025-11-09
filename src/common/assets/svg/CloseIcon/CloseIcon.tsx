import React from 'react'
import Svg, { G, Line, SvgProps } from 'react-native-svg'

import useTheme from '@common/hooks/useTheme'

interface Props extends SvgProps {
  width?: number
  height?: number
  strokeWidth?: string
}

const CloseIcon: React.FC<Props> = ({
  width = 14,
  height = 14,
  strokeWidth = '1.5',
  color,
  ...rest
}) => {
  const { theme } = useTheme()
  return (
    <Svg width={width} height={height} viewBox="0 0 14.121 14.121" {...rest}>
      <G transform="translate(-70.81 -462.818)">
        <Line
          x2="12"
          y2="12"
          transform="translate(71.871 463.879)"
          fill="none"
          stroke={color || theme.iconPrimary}
          strokeLinecap="round"
          strokeWidth={strokeWidth}
        />
        <Line
          x1="12"
          y2="12"
          transform="translate(71.871 463.879)"
          fill="none"
          stroke={color || theme.iconPrimary}
          strokeLinecap="round"
          strokeWidth={strokeWidth}
        />
      </G>
    </Svg>
  )
}

export default CloseIcon
