import './gradient.css'

import React from 'react'
import { View } from 'react-native'

const Gradient = ({ style = {} }: { style?: React.CSSProperties }) => {
  return <View nativeID="gradient" style={style} />
}

export default Gradient
