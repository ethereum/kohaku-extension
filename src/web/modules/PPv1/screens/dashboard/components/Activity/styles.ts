import { StyleSheet, TextStyle } from 'react-native'

import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

interface Style {
  noPositions: TextStyle
}

const styles = StyleSheet.create<Style>({
  noPositions: {
    textAlign: 'center',
    ...flexbox.flex1,
    ...spacings.mtMd
  }
})

export default styles
