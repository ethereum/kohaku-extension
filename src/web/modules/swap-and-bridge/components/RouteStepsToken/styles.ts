import { StyleSheet, TextStyle, ViewStyle } from 'react-native'

import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

interface Style {
  tokenContainer: ViewStyle
  textContainer: ViewStyle
  tokenWrapper: ViewStyle
  text: TextStyle
}

const WIDTH = 70

const styles = StyleSheet.create<Style>({
  tokenWrapper: {
    ...spacings.phMi,
    ...spacings.pvMi,
    width: WIDTH
  },
  textContainer: {
    // Gets centered when text is short, but grows left (or right) if long, based on the flex model
    minWidth: '100%'
  },
  text: {
    textAlign: 'center',
    // @ts-ignore missing in types, but it exists in React Native web
    whiteSpace: 'nowrap'
  },
  tokenContainer: {
    ...flexbox.alignSelfCenter,
    ...spacings.mbMi,
    ...spacings.mtSm
  }
})

export default styles
