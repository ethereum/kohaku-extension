import React from 'react'
import { View } from 'react-native'
import { Pressable } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useTranslation } from 'react-i18next'

import Text from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { THEME_TYPES } from '@common/styles/themeConfig'
import { DASHBOARD_OVERVIEW_BACKGROUND } from '@web/modules/PPv1/screens/dashboard/screens/styles'
import { getAvatarColors } from '@common/utils/avatars'
import mixHexColors from '@common/utils/mixHexColors'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'

import getStyles from './styles'

export type TransferTabType = 'privacy-pools' | 'railgun'

interface Props {
  activeTab: TransferTabType
  onTabChange: (tab: TransferTabType) => void
}

const TABS: {
  type: TransferTabType
  tabLabel: string
  testID?: string
}[] = [
  {
    testID: 'tab-privacy-pools',
    type: 'privacy-pools',
    tabLabel: 'Privacy Pools'
  },
  {
    testID: 'tab-railgun',
    type: 'railgun',
    tabLabel: 'Railgun'
  }
]

const Tabs: React.FC<Props> = ({ activeTab, onTabChange }) => {
  const { styles, theme, themeType } = useTheme(getStyles)
  const { account } = useSelectedAccountControllerState()
  const avatarColors = getAvatarColors(account?.addr || '')
  const { t } = useTranslation()

  return (
    <View style={styles.container}>
      {TABS.map(({ type, tabLabel, testID }, tabIndex) => {
        const activeTabIndex = TABS.findIndex((tab) => tab.type === activeTab)
        const indexDiff = tabIndex - activeTabIndex
        const isActive = activeTab === type

        return (
          <View key={type} style={[flexbox.directionRow, flexbox.alignCenter]}>
            <Pressable
              testID={testID}
              onPress={() => onTabChange(type)}
            >
              {({ hovered }: any) => (
                <LinearGradient
                  colors={
                    isActive
                      ? themeType === THEME_TYPES.DARK
                        ? [
                            `${DASHBOARD_OVERVIEW_BACKGROUND}80`,
                            mixHexColors(`${DASHBOARD_OVERVIEW_BACKGROUND}80`, avatarColors[1], 0.7)
                          ]
                        : [
                            DASHBOARD_OVERVIEW_BACKGROUND,
                            mixHexColors(DASHBOARD_OVERVIEW_BACKGROUND, avatarColors[1], 0.8)
                          ]
                      : ['transparent', 'transparent']
                  }
                  start={{ x: 0.0, y: 1 }}
                  end={{ x: 0.2, y: 0 }}
                  locations={[0.4, 1]}
                  style={[
                    styles.toggleItem,
                    spacings.phLg,
                    {
                      // @ts-ignore cursor is web only
                      cursor: 'pointer'
                    }
                  ]}
                >
                  <Text
                    weight={isActive ? 'medium' : 'regular'}
                    color={
                      isActive
                        ? themeType === THEME_TYPES.DARK
                          ? theme.primary
                          : theme.primaryBackground
                        : hovered
                        ? theme.primaryText
                        : theme.secondaryText
                    }
                    fontSize={16}
                  >
                    {t(tabLabel)}
                  </Text>
                </LinearGradient>
              )}
            </Pressable>
            {tabIndex !== TABS.length - 1 && (
              <View
                style={{
                  borderRightWidth: 1,
                  height: 24,
                  borderRightColor:
                    indexDiff >= 1 || indexDiff < -1 ? theme.secondaryBorder : 'transparent'
                }}
              />
            )}
          </View>
        )
      })}
    </View>
  )
}

export default React.memo(Tabs)

