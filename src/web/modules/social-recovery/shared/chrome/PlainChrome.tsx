/**
 * The chrome of a surface outside settings: the plain header, the stage
 * counter where the screen gives one, and the panel that holds the screen's
 * view at the panel's full width, with no settings sidebar and no breadcrumb.
 */
import React from 'react'
import { ScrollView, View } from 'react-native'

import Panel from '@common/components/Panel'
import { getPanelPaddings } from '@common/components/Panel/Panel'
import useTheme from '@common/hooks/useTheme'
import useWindowSize from '@common/hooks/useWindowSize'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import getStyles from '@web/modules/settings/contexts/SettingsRoutesContext/styles'

import PlainHeader from './PlainHeader'
import StepCounter from './StepCounter'
import type { PlainChromeProps } from './types'

const GROW = { flexGrow: 1 } as const
const COLUMN = { width: '100%', flexGrow: 1 } as const

const PlainChrome = ({ title, counter, children, testID }: PlainChromeProps) => {
  const { styles } = useTheme(getStyles)
  const { maxWidthSize } = useWindowSize()

  const isScreenXl = maxWidthSize('xl')

  return (
    <View style={styles.background} testID={testID}>
      <View style={[styles.contentContainer, !isScreenXl ? common.fullWidth : {}]}>
        <PlainHeader title={title} />
        <Panel
          style={[
            styles.panel,
            !isScreenXl ? common.fullWidth : {},
            { ...spacings.ph0, ...spacings.pv0 }
          ]}
        >
          <ScrollView contentContainerStyle={[getPanelPaddings(maxWidthSize, 'large'), GROW]}>
            <View style={COLUMN}>
              {!!counter && <StepCounter {...counter} />}
              {children}
            </View>
          </ScrollView>
        </Panel>
      </View>
    </View>
  )
}

export default React.memo(PlainChrome)
