import React from 'react'
import { Image, ImageStyle, StyleProp } from 'react-native'
import ubammWallet from '@web/assets/ubamm-wallet.png'

type KohakuLogoProps = {
  width?: number
  height?: number
  style?: StyleProp<ImageStyle>
}

const KohakuLogo: React.FC<KohakuLogoProps> = ({ width = 83, height = 28, style }) => {
  return (
    <Image source={{ uri: ubammWallet }} style={[{ width, height }, style]} resizeMode="contain" />
  )
}

export default React.memo(KohakuLogo)
