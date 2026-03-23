import React, { useCallback } from 'react'
import { Animated, Pressable, View } from 'react-native'

import BurgerIcon from '@common/assets/svg/BurgerIcon'
import AmbireLogoHorizontal from '@common/components/AmbireLogoHorizontal/AmbireLogoHorizontal'
import Text from '@common/components/Text/Text'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import { BORDER_RADIUS_PRIMARY } from '@common/styles/utils/common'
import useNavigation from '@common/hooks/useNavigation'
import flexbox from '@common/styles/utils/flexbox'
import useHover from '@web/hooks/useHover'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import { getUiType } from '@web/utils/uiType'

const { isPopup } = getUiType()

const DashboardHeader = () => {
  const { navigate } = useNavigation()
  const { theme } = useTheme()
  const [bindBurgerAnim, burgerAnimStyle] = useHover({ preset: 'opacity' })

  const viewAllAccounts = () => {
    navigate(WEB_ROUTES.accountSelect)
  }

  const openSettings = useCallback(() => {
    navigate(isPopup ? WEB_ROUTES.menu : WEB_ROUTES.generalSettings)
  }, [navigate])

  return (
    <View
      style={[
        flexbox.directionRow,
        flexbox.justifySpaceBetween,
        flexbox.alignCenter,
        spacings.phMd,
        spacings.pvTy
      ]}
    >
      <View style={[flexbox.directionRow, flexbox.alignCenter]}>
        <AmbireLogoHorizontal width={100} height={40} />
        <Pressable
          onPress={viewAllAccounts}
          style={[
            spacings.mlSm,
            spacings.phSm,
            spacings.pvTy,
            {
              borderRadius: BORDER_RADIUS_PRIMARY,
              borderWidth: 1,
              borderColor: theme.primaryBorder,
              backgroundColor: theme.secondaryBackground
            }
          ]}
        >
          <Text fontSize={11} weight="medium" appearance="secondaryText">
            All Accounts
          </Text>
        </Pressable>
      </View>
      <View style={[flexbox.directionRow, flexbox.alignCenter]}>
        <Pressable
          style={[spacings.pvTy, spacings.phTy]}
          onPress={openSettings}
          {...bindBurgerAnim}
        >
          <Animated.View style={burgerAnimStyle}>
            <BurgerIcon color={String(theme.primaryText)} width={20} height={20} />
          </Animated.View>
        </Pressable>
      </View>
    </View>
  )
}

export default DashboardHeader
