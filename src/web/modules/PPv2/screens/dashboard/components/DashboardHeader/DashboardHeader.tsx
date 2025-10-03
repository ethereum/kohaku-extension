import React from 'react'
import { Animated, Pressable, View } from 'react-native'

import useNavigation from '@common/hooks/useNavigation'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import flexboxStyles from '@common/styles/utils/flexbox'
import useHover from '@web/hooks/useHover'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import commonWebStyles from '@web/styles/utils/common'
import importIcon from '@web/assets/import.png'
import AccountButton from './AccountButton'

const DashboardHeader = () => {
  const { account } = useSelectedAccountControllerState()
  const [bindBurgerAnim, burgerAnimStyle] = useHover({ preset: 'opacity' })
  const { navigate } = useNavigation()

  if (!account) return null

  return (
    <View
      style={[
        flexboxStyles.directionRow,
        flexboxStyles.alignCenter,
        flexboxStyles.flex1,
        commonWebStyles.contentContainer
      ]}
    >
      <View
        style={[flexboxStyles.directionRow, flexboxStyles.flex1, flexboxStyles.justifySpaceBetween]}
      >
        <AccountButton />
        <Pressable
          testID="dashboard-hamburger-btn"
          style={[spacings.ml, spacings.phTy, spacings.pvTy, flexboxStyles.alignSelfCenter]}
          onPress={() => navigate(WEB_ROUTES.pp2Import)}
          {...bindBurgerAnim}
        >
          <Animated.View style={burgerAnimStyle}>
            <img
              src={importIcon}
              alt="Import"
              width={24}
              height={24}
              loading="lazy"
              draggable={false}
              style={{ filter: 'invert(1)' }}
            />
          </Animated.View>
        </Pressable>
      </View>
    </View>
  )
}

export default React.memo(DashboardHeader)
