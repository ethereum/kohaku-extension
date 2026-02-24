import React from 'react'
import { ColorValue } from 'react-native'
import Svg, { Circle, G, Line, SvgProps } from 'react-native-svg'

interface Props extends SvgProps {
  width?: number
  height?: number
  strokeWidth?: string
  color?: ColorValue
  circleColor?: ColorValue
}

const CloseIconWithCircle: React.FC<Props> = ({
  width = 16,
  height = 16,
  strokeWidth = '1.5',
  color,
  circleColor,
  ...rest
}) => {
  return (
    <Svg width={width} height={height} viewBox="0 0 16 16" {...rest}>
      <Circle
        cx="8"
        cy="8"
        r="7.5"
        fill="none"
        stroke={String(circleColor || color)}
        strokeWidth="1.5"
      />
      <G transform="translate(5, 5)">
        <Line
          x2="6"
          y2="6"
          fill="none"
          stroke={String(color)}
          strokeLinecap="round"
          strokeWidth={strokeWidth}
        />
        <Line
          x1="6"
          y2="6"
          fill="none"
          stroke={String(color)}
          strokeLinecap="round"
          strokeWidth={strokeWidth}
        />
      </G>
    </Svg>
  )
}

export default CloseIconWithCircle
