import React, { useCallback, useEffect } from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Panel from '@common/components/Panel'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import ConfettiAnimation from '@common/modules/dashboard/components/ConfettiAnimation'
import Header from '@common/modules/header/components/Header'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import text from '@common/styles/utils/text'
import {
  TabLayoutContainer,
  TabLayoutWrapperMainContent
} from '@web/components/TabLayoutWrapper/TabLayoutWrapper'
import { engine } from '@web/constants/browserapi'
import { TAB_CONTENT_WIDTH } from '@web/constants/spacings'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useWalletStateController from '@web/hooks/useWalletStateController'
import PinExtension from '@web/modules/auth/components/PinExtension'
import KohakuLogo from '@common/components/HokahuLogo'
import Divider from '@common/components/Divider'
import Pill from '@common/components/Pill'

export const CARD_WIDTH = 400

const OnboardingCompletedScreen = () => {
  const { t } = useTranslation()
  const { dispatch } = useBackgroundService()
  const { isPinned } = useWalletStateController()

  const { theme } = useTheme()

  useEffect(() => {
    dispatch({ type: 'SET_IS_SETUP_COMPLETE', params: { isSetupComplete: true } })
  }, [dispatch])

  const handleOpenDashboardPress = useCallback(async () => {
    dispatch({ type: 'OPEN_EXTENSION_POPUP' })
  }, [dispatch])

  return (
    <>
      <PinExtension />
      <TabLayoutContainer
        backgroundColor={theme.secondaryBackground}
        header={<Header customTitle={' '} />}
      >
        <TabLayoutWrapperMainContent>
          <Panel type="onboarding" spacingsSize="small" style={{ overflow: 'visible' }}>
            <View style={[flexbox.flex1, flexbox.alignCenter, spacings.pt3Xl]}>
              <View style={[flexbox.alignCenter, flexbox.justifyCenter]}>
                <ConfettiAnimation width={TAB_CONTENT_WIDTH} height={380} autoPlay={false} />
                <KohakuLogo width={96} height={80} />
              </View>
              <Text
                style={[spacings.mtLg, text.center, { marginBottom: 6 }]}
                weight="semiBold"
                fontSize={20}
              >
                {t('Kohaku is ready to use')}
              </Text>
              <Text appearance="muted" fontSize={13} style={{ marginBottom: 2 }}>
                Your private DeFi wallet is set up.
              </Text>
              <Text appearance="muted" fontSize={13}>
                Start exploring — privately.
              </Text>
              <Divider style={{ marginTop: 18, marginBottom: 15 }} />
              <View
                style={[
                  flexbox.justifySpaceBetween,
                  flexbox.directionRow,
                  { width: '100%', paddingHorizontal: 20 }
                ]}
              >
                <Pill text="Private" textStyle={{ color: theme.textPrimary }} />
                <Pill text="Fast" textStyle={{ color: theme.textPrimary }} />
                <Pill text="Simple" textStyle={{ color: theme.textPrimary }} />
              </View>
              <Divider style={{ marginTop: 18, marginBottom: 15 }} />
              {!isPinned ? (
                <Text appearance="muted" fontSize={13} weight="medium" style={[text.center]}>
                  {t('Pin the Kohaku Extension to your toolbar for easy access.')}
                </Text>
              ) : (
                <Text appearance="muted" fontSize={13} weight="medium" style={[text.center]}>
                  {t('You can access your accounts from the dashboard via the extension icon.')}
                </Text>
              )}
              {engine !== 'gecko' && (
                <View style={[flexbox.flex1, flexbox.justifyEnd, spacings.mt, { width: '100%' }]}>
                  <Button
                    testID="onboarding-completed-open-dashboard-btn"
                    text={t('Open dashboard →')}
                    hasBottomSpacing={false}
                    onPress={handleOpenDashboardPress}
                  />
                </View>
              )}
              <Text
                fontSize={11}
                color={`${theme.muted.toString()}80`}
                style={[text.center, { marginTop: 14 }]}
              >
                Secured by RAILGUN · Zero-knowledge proofs
              </Text>
            </View>
          </Panel>
        </TabLayoutWrapperMainContent>
      </TabLayoutContainer>
    </>
  )
}

export default React.memo(OnboardingCompletedScreen)
