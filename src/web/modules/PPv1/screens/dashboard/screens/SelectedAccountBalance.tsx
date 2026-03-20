import spacings from '@common/styles/spacings'
import { ThemeProps } from '@common/styles/themeConfig'
import { BORDER_RADIUS_PRIMARY } from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import { getRailgunAddress } from '@kohaku-eth/railgun'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import useTheme from '@common/hooks/useTheme'
import Text from '@common/components/Text/Text'
import useRailgunControllerState from '@web/hooks/useRailgunControllerState'

type ActiveView = 'public' | 'private'

const getPillStyle = (activeView: ActiveView, theme: ThemeProps) => ({
  borderBottomRightRadius: BORDER_RADIUS_PRIMARY,
  borderBottomLeftRadius: BORDER_RADIUS_PRIMARY,
  backgroundColor: activeView === 'private' ? theme.secondaryBackground : theme.successBackground,
  width: 'max-content' as unknown as number
})

interface SelectedAccountBalanceProps {
  activeView: ActiveView
  integerValue: string
  decimalValue: string
  label: string
}

const SelectedAccountBalance = ({
  activeView,
  integerValue,
  decimalValue,
  label
}: SelectedAccountBalanceProps) => {
  const { theme, styles } = useTheme()
  const pillStyle = getPillStyle(activeView, theme)

  return (
    <View style={[flexbox.directionRow, flexbox.center, spacings.phTy, spacings.pvTy, pillStyle]}>
      <Text>{label}: </Text>
      <View style={[flexbox.directionRow, flexbox.justifyCenter, { alignItems: 'baseline' }]}>
        <Text fontSize={32} weight="number_bold" shouldScale={false} appearance="primaryText">
          {integerValue}
        </Text>
        {decimalValue && (
          <Text style={styles.cents} weight="number_bold" shouldScale={false}>
            .{decimalValue}
          </Text>
        )}
      </View>
    </View>
  )
}

interface PrivateProps {
  integerValue: string
  decimalValue: string
}

export const SelectedPrivateBalance = ({ integerValue, decimalValue }: PrivateProps) => {
  const { defaultRailgunKeys } = useRailgunControllerState()
  const [railgunAddress, setRailgunAddress] = useState<string | null>(null)

  useEffect(() => {
    const calculateRailgunAddress = async () => {
      if (railgunAddress || !defaultRailgunKeys) return

      try {
        const address = await getRailgunAddress({
          type: 'key',
          spendingKey: defaultRailgunKeys.spendingKey,
          viewingKey: defaultRailgunKeys.viewingKey
        })
        setRailgunAddress(address)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to calculate railgun address:', error)
        setRailgunAddress(null)
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    calculateRailgunAddress()
  }, [defaultRailgunKeys])

  return (
    <SelectedAccountBalance
      activeView="private"
      label="Private Account"
      integerValue={integerValue}
      decimalValue={decimalValue}
    />
  )
}

interface PublicProps {
  label: string
  integerValue: string
  decimalValue: string
}

export const SelectedPublicBalance = ({ label, integerValue, decimalValue }: PublicProps) => {
  return (
    <SelectedAccountBalance
      activeView="public"
      label={label}
      integerValue={integerValue}
      decimalValue={decimalValue}
    />
  )
}
