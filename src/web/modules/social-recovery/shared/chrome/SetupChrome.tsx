/**
 * The settings chrome every setup screen draws: the settings sidebar with
 * account recovery active, the logo header, and the panel that holds the
 * breadcrumb and the screen's view in one column.
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

import type { SetupChromeProps } from './types'

const COLUMN = { maxWidth: 600, width: '100%' } as const

const SetupChrome = ({ children, testID }: SetupChromeProps) => {
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
            <ScrollView contentContainerStyle={getPanelPaddings(maxWidthSize, 'large')}>
              <Text fontSize={12} appearance="secondaryText" style={spacings.mbSm}>
                {t('socialRecovery.chrome.breadcrumb')}
              </Text>
              <View style={COLUMN}>{children}</View>
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
