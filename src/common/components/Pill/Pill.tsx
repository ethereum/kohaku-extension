import useTheme from '@common/hooks/useTheme'
import { ThemeProps } from '@common/styles/themeConfig'
import { StyleProp, StyleSheet, TextStyle, View, ViewStyle } from 'react-native'
import Text from '../Text'

interface Props {
  text: string
  variant?: 'success' | 'pending' | 'error' | 'accent'
  textStyle?: StyleProp<TextStyle>
  withIndicator?: boolean
  style?: StyleProp<ViewStyle>
}

const variantStyles = (color: string) => ({
  container: { backgroundColor: `${color}1f`, borderColor: `${color}80` },
  text: { color },
  indicator: { backgroundColor: color }
})

const getStyles = (theme: ThemeProps) =>
  StyleSheet.create({
    container: {
      borderStyle: 'solid',
      borderWidth: 1,
      borderColor: `${theme.accent.toString()}99`,
      borderRadius: 14,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: 'transparent'
    },
    text: { color: theme.accent },
    indicator: {
      backgroundColor: theme.accent,
      width: 8,
      height: 8,
      borderRadius: 999,
      marginRight: 4
    }
  })

const VARIANT_COLOR_MAP = (theme: ThemeProps): Record<string, string> => ({
  success: theme.success.toString(),
  pending: theme.warning.toString(),
  error: theme.danger.toString(),
  accent: theme.accent.toString()
})

const Pill = ({ text, variant, textStyle, withIndicator, style }: Props) => {
  const { styles, theme } = useTheme(getStyles)

  const variantColor = variant ? VARIANT_COLOR_MAP(theme)[variant] : undefined
  const derived = variantColor ? variantStyles(variantColor) : null

  return (
    <View style={[styles.container, derived?.container, style]}>
      <Text fontSize={12} weight="number_bold" style={[styles.text, derived?.text, textStyle]}>
        {withIndicator && <View style={[styles.indicator, derived?.indicator]} />}
        {text}
      </Text>
    </View>
  )
}

export default Pill
