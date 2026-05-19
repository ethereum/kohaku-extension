import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { StyleSheet, View, ViewStyle } from 'react-native'
import { ThemeProps } from '@common/styles/themeConfig'
import useTheme from '@common/hooks/useTheme'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'

type Style = {
  disclaimer: ViewStyle
  disclaimerText: ViewStyle
}

const getStyles = (theme: ThemeProps) =>
  StyleSheet.create<Style>({
    disclaimer: {
      paddingVertical: 9,
      paddingHorizontal: 16,
      backgroundColor: '#FFA50014',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#FFA50066'
    },
    disclaimerText: {
      color: theme.warning
    }
  })

const Disclaimer = () => {
  const { styles } = useTheme(getStyles)
  const { t } = useTranslation()

  return (
    <View style={[spacings.mbSm, styles.disclaimer]}>
      <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifyCenter]}>
        <Text style={styles.disclaimerText} appearance="secondaryText" fontSize={14} weight="light">
          {t('Funds being send through your private account')}
        </Text>
      </View>
    </View>
  )
}

export default Disclaimer
