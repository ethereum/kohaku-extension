import React from 'react'
import { Image, ImageStyle, StyleProp } from 'react-native'
import kohakuLogo from '@web/assets/kohaku.png'

type KohakuLogoProps = {
  width?: number
  height?: number
  style?: StyleProp<ImageStyle>
}

const KohakuLogo: React.FC<KohakuLogoProps> = ({ width = 83, height = 28, style }) => {
  return (
    <Image source={{ uri: kohakuLogo }} style={[{ width, height }, style]} resizeMode="contain" />
  )
}

export default React.memo(KohakuLogo)
