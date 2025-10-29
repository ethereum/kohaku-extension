import React from 'react'
import { Animated, Pressable, View } from 'react-native'

import useNavigation from '@common/hooks/useNavigation'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import flexboxStyles from '@common/styles/utils/flexbox'
import useHover from '@web/hooks/useHover'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import commonWebStyles from '@web/styles/utils/common'
import BurgerIcon from '@common/assets/svg/BurgerIcon'
import { THEME_TYPES } from '@common/styles/themeConfig'
import { getUiType } from '@web/utils/uiType'
import useTheme from '@common/hooks/useTheme'
import AccountButton from './AccountButton'
import getStyles from './styles'

const { isPopup } = getUiType()

const DashboardHeader = () => {
  const { account } = useSelectedAccountControllerState()
  const [bindBurgerAnim, burgerAnimStyle] = useHover({ preset: 'opacity' })
  const { navigate } = useNavigation()
  const { theme, themeType } = useTheme(getStyles)

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
        <View style={[flexboxStyles.directionRow, flexboxStyles.alignCenter]}>
          <AccountButton />
        </View>
        <Pressable
          testID="dashboard-hamburger-btn"
          style={[spacings.ml, spacings.phTy, spacings.pvTy, flexboxStyles.alignSelfCenter]}
          onPress={() =>
            isPopup ? navigate(WEB_ROUTES.menu) : navigate(WEB_ROUTES.generalSettings)
          }
          {...bindBurgerAnim}
        >
          <Animated.View style={burgerAnimStyle}>
            <BurgerIcon
              color={
                themeType === THEME_TYPES.DARK
                  ? theme.primaryBackgroundInverted
                  : theme.primaryBackground
              }
              width={20}
              height={20}
            />
          </Animated.View>
        </Pressable>
      </View>
    </View>
  )
}

export default React.memo(DashboardHeader)
