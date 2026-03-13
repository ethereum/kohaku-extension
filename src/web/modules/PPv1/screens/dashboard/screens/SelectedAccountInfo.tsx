import React, { useEffect, useState } from 'react'
import { View } from 'react-native'

import CopyText from '@common/components/CopyText'
import Text from '@common/components/Text/Text'
import useTheme from '@common/hooks/useTheme'
import spacings, { SPACING_SM } from '@common/styles/spacings'
import { ThemeProps } from '@common/styles/themeConfig'
import { BORDER_RADIUS_PRIMARY } from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import { getRailgunAddress } from '@kohaku-eth/railgun'
import { RailgunAccountKeys } from '@ambire-common/controllers/railgun/railgun'

type ActiveView = 'public' | 'private'

const truncateAddress = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`

const getPillStyle = (activeView: ActiveView, theme: ThemeProps) => ({
  borderBottomRightRadius: BORDER_RADIUS_PRIMARY,
  borderBottomLeftRadius: BORDER_RADIUS_PRIMARY,
  backgroundColor: activeView === 'private' ? theme.secondaryBackground : theme.successBackground,
  width: 'max-content' as unknown as number
})

interface Props {
  activeView: ActiveView
  accountLabel: string | undefined
  accountAddr: string | undefined
  selectedInteger: string
  selectedDecimal: string | undefined
  privateInteger: string
  privateDecimal: string | undefined
  defaultRailgunKeys: RailgunAccountKeys | null
}

const SelectedAccountInfo = ({
  activeView,
  accountLabel,
  accountAddr,
  selectedInteger,
  selectedDecimal,
  privateInteger,
  privateDecimal,
  defaultRailgunKeys
}: Props) => {
  const { theme } = useTheme()
  const [railgunAddress, setRailgunAddress] = useState<string | null>(null)
  const pillStyle = getPillStyle(activeView, theme)
  const displayAddr = activeView === 'private' ? railgunAddress : accountAddr

  useEffect(() => {
    const calculateRailgunAddress = async () => {
      if (activeView === 'public' || railgunAddress || !defaultRailgunKeys) return

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
  }, [defaultRailgunKeys, activeView])

  return (
    <View
      style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween, spacings.mh]}
    >
      <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.center]}>
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
          <Text fontSize={14} weight="number_regular" appearance="primaryText">
            {activeView === 'private'
              ? 'Private Account'
              : accountLabel || truncateAddress(accountAddr || '')}
          </Text>
          <Text
            fontSize={12}
            weight="semiBold"
            appearance="secondaryText"
            style={{ marginLeft: SPACING_SM }}
          >
            {activeView === 'private' ? (
              <>
                {privateInteger}
                {privateDecimal ? `.${privateDecimal}` : ''}
              </>
            ) : (
              <>
                {selectedInteger}
                {selectedDecimal ? `.${selectedDecimal}` : ''}
              </>
            )}
          </Text>
        </View>
      </View>
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
    </View>
  )
}

export default SelectedAccountInfo
