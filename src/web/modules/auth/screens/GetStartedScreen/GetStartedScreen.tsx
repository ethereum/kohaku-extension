import React, { useCallback, useEffect } from 'react'
import { View } from 'react-native'

// import ViewModeIcon from '@common/assets/svg/ViewModeIcon'
import Button from '@common/components/Button'
import Panel from '@common/components/Panel'
// import ScrollableWrapper from '@common/components/ScrollableWrapper'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useNavigation from '@common/hooks/useNavigation'
import useTheme from '@common/hooks/useTheme'
import { AUTH_STATUS } from '@common/modules/auth/constants/authStatus'
import useAuth from '@common/modules/auth/hooks/useAuth'
import useOnboardingNavigation from '@common/modules/auth/hooks/useOnboardingNavigation'
// import Header from '@common/modules/header/components/Header'
import { ROUTES, WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
// import text from '@common/styles/utils/text'
import {
  TabLayoutContainer,
  TabLayoutWrapperMainContent
} from '@web/components/TabLayoutWrapper/TabLayoutWrapper'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useWalletStateController from '@web/hooks/useWalletStateController'

import KohakuLogo from '@common/components/HokahuLogo'
import Divider from '@common/components/Divider'
import getStyles from './styles'

export const CARD_WIDTH = 400

const GetStartedScreen = () => {
  const { theme } = useTheme(getStyles)
  const { t } = useTranslation()
  const { navigate } = useNavigation()
  const { goToNextRoute } = useOnboardingNavigation()

  const { authStatus } = useAuth()
  const { dispatch } = useBackgroundService()

  const state = useWalletStateController()

  const resetIsSetupCompleteIfNeeded = useCallback(() => {
    if (authStatus === AUTH_STATUS.NOT_AUTHENTICATED && !state.isPinned && state.isSetupComplete) {
      dispatch({ type: 'SET_IS_SETUP_COMPLETE', params: { isSetupComplete: false } })
    }
  }, [authStatus, dispatch, state.isPinned, state.isSetupComplete])

  useEffect(() => {
    if (authStatus === AUTH_STATUS.AUTHENTICATED) {
      navigate(ROUTES.mainDashboard)
      return
    }

    resetIsSetupCompleteIfNeeded()
  }, [authStatus, navigate, resetIsSetupCompleteIfNeeded])

  const handleAuthButtonPress = useCallback(
    async (flow: 'create-new-account' | 'import-existing-account' | 'view-only') => {
      if (flow === 'create-new-account') {
        goToNextRoute(WEB_ROUTES.createSeedPhrasePrepare)
        return
      }
      if (flow === 'import-existing-account') {
        // goToNextRoute(WEB_ROUTES.importExistingAccount)
        goToNextRoute(WEB_ROUTES.importSeedPhrase)
        return
      }
      if (flow === 'view-only') {
        goToNextRoute(WEB_ROUTES.viewOnlyAccountAdder)
      }
    },
    [goToNextRoute]
  )

  return (
    <TabLayoutContainer
      backgroundColor={theme.secondaryBackground}
      // header={<Header mode="custom-inner-content" withAmbireLogo />}
      header={null}
      containerStyle={[flexbox.center]}
      style={{ ...flexbox.center, height: '100%' }}
    >
      <TabLayoutWrapperMainContent contentContainerStyle={{ margin: 'auto', height: 'auto' }}>
        <Panel spacingsSize="small" type="onboarding" style={{ minHeight: 0 }}>
          <View style={[flexbox.justifySpaceBetween, flexbox.flex1]}>
            <View
              style={[flexbox.justifyCenter, flexbox.alignCenter, flexbox.flex1, spacings.mbSm]}
            >
              <KohakuLogo width={180} height={80} />
              <Text
                color={theme.textPrimary}
                fontSize={22}
                style={{
                  marginBottom: 4
                }}
              >
                Welcome to Kohaku
              </Text>
              <Text appearance="muted" fontSize={13}>
                Private DeFi, simplified.
              </Text>
            </View>
            <Divider style={{ backgroundColor: '#097DB233', marginBottom: 18 }} />
            <View>
              <Button
                testID="create-new-account-btn"
                type="primary"
                text={t('Create new account')}
                onPress={() => handleAuthButtonPress('create-new-account')}
              />
              <Button
                testID="create-existing-account-btn"
                type="secondary"
                text={t('Import existing account')}
                onPress={() => handleAuthButtonPress('import-existing-account')}
              />
              {/* <Button
                testID="view-only-address-btn"
                type="ghost"
                hasBottomSpacing={false}
                onPress={() => handleAuthButtonPress('view-only')}
                text={t('Watch an address')}
                >
                <ViewModeIcon color={theme.primary} width={24} style={spacings.mlTy} />
                </Button> */}
            </View>
            <Text appearance="muted" fontSize={11} style={{ textAlign: 'center' }}>
              v0.1.0 · kohaku.xyz
            </Text>
          </View>
        </Panel>
      </TabLayoutWrapperMainContent>
    </TabLayoutContainer>
  )
}

export default React.memo(GetStartedScreen)
