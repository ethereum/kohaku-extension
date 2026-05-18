import useTheme from '@common/hooks/useTheme'
import { ThemeProps } from '@common/styles/themeConfig'
import React from 'react'
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native'

const getStyles = (theme: ThemeProps) =>
  StyleSheet.create({
    divider: {
      backgroundColor: theme.accent
    }
  })

interface Props {
  direction?: 'horizontal' | 'vertical'
  style?: StyleProp<ViewStyle>
}

const horizontalStyle = {
  width: '100%',
  height: 1
}

const verticalStyle = {
  width: 1,
  height: '100%'
}

const Divider = ({ direction = 'horizontal', style }: Props) => {
  const { styles } = useTheme(getStyles)

  return (
    <View
      style={[styles.divider, direction === 'horizontal' ? horizontalStyle : verticalStyle, style]}
    />
  )
}

export default Divider
