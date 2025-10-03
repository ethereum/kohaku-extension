import React from 'react'
import { Animated, Pressable, View } from 'react-native'

import useNavigation from '@common/hooks/useNavigation'
import { ROUTES, WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import flexboxStyles from '@common/styles/utils/flexbox'
import useHover from '@web/hooks/useHover'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import commonWebStyles from '@web/styles/utils/common'
import SettingsIcon from '@common/assets/svg/SettingsIcon'
import LeftArrowIcon from '@common/assets/svg/LeftArrowIcon'
import AccountButton from './AccountButton'

const DashboardHeader = () => {
  const { account } = useSelectedAccountControllerState()
  const [bindBackAnim, backAnimStyle] = useHover({ preset: 'opacity' })
  const [bindSettingsAnim, settingsAnimStyle] = useHover({ preset: 'opacity' })
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
        <View style={[flexboxStyles.directionRow, flexboxStyles.alignCenter]}>
          <Pressable
            testID="dashboard-back-btn"
            style={[
              spacings.phTy,
              spacings.pvTy,
              flexboxStyles.alignSelfCenter,
              flexboxStyles.alignCenter,
              flexboxStyles.justifyCenter,
              {
                width: 40,
                height: 40,
                borderRadius: 8
              }
            ]}
            onPress={() => navigate(ROUTES.dashboard)}
            {...bindBackAnim}
          >
            <Animated.View style={backAnimStyle}>
              <LeftArrowIcon width={12} height={18} color="white" />
            </Animated.View>
          </Pressable>
          <View style={spacings.ml}>
            <AccountButton />
          </View>
        </View>
        <Pressable
          testID="dashboard-settings-btn"
          style={[
            spacings.ml,
            spacings.phTy,
            spacings.pvTy,
            flexboxStyles.alignSelfCenter,
            flexboxStyles.alignCenter,
            flexboxStyles.justifyCenter,
            {
              width: 40,
              height: 40,
              borderRadius: 8
            }
          ]}
          onPress={() => navigate(WEB_ROUTES.pp1Settings)}
          {...bindSettingsAnim}
        >
          <Animated.View style={settingsAnimStyle}>
            <SettingsIcon width={20} height={20} color="white" />
          </Animated.View>
        </Pressable>
      </View>
    </View>
  )
}

export default React.memo(DashboardHeader)
