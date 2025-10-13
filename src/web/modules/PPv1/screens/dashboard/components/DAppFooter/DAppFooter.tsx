import React from 'react'
import { View } from 'react-native'

import useTheme from '@common/hooks/useTheme'

import getStyles from './styles'

const DAppFooter = () => {
  const { styles } = useTheme(getStyles)

  return <View style={styles.footerContainer} />
}

export default React.memo(DAppFooter)
