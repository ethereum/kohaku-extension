import { StyleSheet, ViewStyle } from 'react-native'

interface Style {
  addToAddressBook: ViewStyle
}

const styles = StyleSheet.create<Style>({
  addToAddressBook: {
    maxWidth: 240
  }
})

export default styles
