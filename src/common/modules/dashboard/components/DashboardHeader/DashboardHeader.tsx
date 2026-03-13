import React from 'react'
import { Animated, Pressable, View } from 'react-native'

import Text from '@common/components/Text'
import useNavigation from '@common/hooks/useNavigation'
import useTheme from '@common/hooks/useTheme'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import flexboxStyles from '@common/styles/utils/flexbox'
import useHover from '@web/hooks/useHover'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import commonWebStyles from '@web/styles/utils/common'

import AccountButton from './AccountButton'
import getStyles from './styles'

const DashboardHeader = () => {
  const { account } = useSelectedAccountControllerState()
  const [bindDashboardAnim, dashboardAnimStyle] = useHover({ preset: 'opacity' })
  const { navigate } = useNavigation()
  useTheme(getStyles)

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
          testID="dashboard-home-btn"
          style={[spacings.ml, spacings.phTy, spacings.pvTy, flexboxStyles.alignSelfCenter]}
          onPress={() => navigate(WEB_ROUTES.mainDashboard)}
          {...bindDashboardAnim}
        >
          <Animated.View style={dashboardAnimStyle}>
            <Text fontSize={14} weight="medium" appearance="secondaryText">
              Back To Dashboard
            </Text>
          </Animated.View>
        </Pressable>
      </View>
    </View>
  )
}

export default React.memo(DashboardHeader)
