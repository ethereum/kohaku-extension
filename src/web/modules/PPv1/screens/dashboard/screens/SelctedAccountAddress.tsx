import CopyText from '@common/components/CopyText'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import Text from '@common/components/Text/Text'
import { View } from 'react-native'
import { useEffect, useState } from 'react'
import useTheme from '@common/hooks/useTheme'
import { ThemeProps } from '@common/styles/themeConfig'
import { BORDER_RADIUS_PRIMARY } from '@common/styles/utils/common'
import useRailgunControllerState from '@web/hooks/useRailgunControllerState'
import { getRailgunAddress } from '@kohaku-eth/railgun'

const truncateAddress = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`

type ActiveView = 'private' | 'public'

interface Props {
  address: string
  activeView: ActiveView
}

const getPillStyle = (activeView: ActiveView, theme: ThemeProps) => ({
  borderBottomRightRadius: BORDER_RADIUS_PRIMARY,
  borderBottomLeftRadius: BORDER_RADIUS_PRIMARY,
  backgroundColor: activeView === 'private' ? theme.secondaryBackground : theme.successBackground,
  width: 'max-content' as unknown as number
})

export const SelctedAccountAddress = ({ address, activeView }: Props) => {
  const { defaultRailgunKeys } = useRailgunControllerState()
  const { theme } = useTheme()
  const [railgunAddress, setRailgunAddress] = useState<string | null>(null)
  const pillStyle = getPillStyle(activeView, theme)
  const displayAddr = activeView === 'private' ? railgunAddress : address

  useEffect(() => {
    if (activeView === 'public' || railgunAddress || !defaultRailgunKeys) return

    const calculateRailgunAddress = async () => {
      try {
        const addr = await getRailgunAddress({
          type: 'key',
          spendingKey: defaultRailgunKeys.spendingKey,
          viewingKey: defaultRailgunKeys.viewingKey
        })
        setRailgunAddress(addr)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to calculate railgun address:', error)
        setRailgunAddress(null)
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    calculateRailgunAddress()
  }, [defaultRailgunKeys, activeView, railgunAddress])

  return (
    <View
      style={[
        flexbox.directionRow,
        flexbox.alignCenter,
        flexbox.center,
        spacings.phTy,
        spacings.pvTy,
        pillStyle
      ]}
    >
      <Text>{truncateAddress(displayAddr || '')}</Text>
      <CopyText text={displayAddr || ''} style={{ ...spacings.mlTy }} />
    </View>
  )
}
