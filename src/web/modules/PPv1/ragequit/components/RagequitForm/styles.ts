import { StyleSheet, ViewStyle } from 'react-native'

import flexbox from '@common/styles/utils/flexbox'

interface Style {
  container: ViewStyle
}

const styles = StyleSheet.create<Style>({
  container: {
    ...flexbox.flex1
  }
})

export default styles
