/**
 * The settings chrome every setup screen draws: the settings sidebar with
 * account recovery active, the logo header, and the panel that holds the
 * breadcrumb, the stage counter where the screen gives one, and the screen's
 * view at the panel's full width. While the wallet selects another account
 * than the one the tab sets up, a notice above the view names the tab's
 * account and offers to switch to the selected one. A chrome told to skip the
 * account latch neither latches the tab's account nor shows the notice.
 */
import React from 'react'
import { ScrollView, View } from 'react-native'

import AmbireLogoHorizontal from '@common/components/AmbireLogoHorizontal'
import Panel from '@common/components/Panel'
import { getPanelPaddings } from '@common/components/Panel/Panel'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import useWindowSize from '@common/hooks/useWindowSize'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import Sidebar from '@web/modules/settings/components/Sidebar'
import getStyles from '@web/modules/settings/contexts/SettingsRoutesContext/styles'

import SetupAccountNotice from './SetupAccountNotice'
import StepCounter from './StepCounter'
import type { SetupChromeProps } from './types'

const GROW = { flexGrow: 1 } as const
const COLUMN = { width: '100%', flexGrow: 1 } as const

const SetupChrome = ({
  children,
  breadcrumbTail,
  skipAccountLatch = false,
  counter,
  testID
}: SetupChromeProps) => {
  const { t } = useTranslation()
  const { styles } = useTheme(getStyles)
  const { maxWidthSize } = useWindowSize()

  const isScreenXxl = maxWidthSize('xxl')
  const isScreenXl = maxWidthSize('xl')

  return (
    <View style={styles.background} testID={testID}>
      <View style={[styles.container, !isScreenXl ? common.fullWidth : {}]}>
        <Sidebar activeLink="account-recovery" />
        <View style={styles.contentContainer}>
          <View style={styles.header}>
            <AmbireLogoHorizontal />
          </View>
          <Panel
            style={[
              styles.panel,
              !isScreenXl ? common.fullWidth : {},
              { ...spacings.ph0, ...spacings.pv0 }
            ]}
          >
            <ScrollView contentContainerStyle={[getPanelPaddings(maxWidthSize, 'large'), GROW]}>
              <Text fontSize={12} appearance="secondaryText" style={spacings.mbSm}>
                {t('socialRecovery.chrome.breadcrumb')}
                {breadcrumbTail ? ` › ${breadcrumbTail}` : null}
              </Text>
              <View style={COLUMN}>
                {!!counter && <StepCounter {...counter} />}
                {!skipAccountLatch && <SetupAccountNotice />}
                {children}
              </View>
            </ScrollView>
          </Panel>
        </View>
        {isScreenXxl ? (
          <View style={styles.sideContainer}>
            <Sidebar activeLink="account-recovery" />
          </View>
        ) : null}
      </View>
    </View>
  )
}

export default React.memo(SetupChrome)
