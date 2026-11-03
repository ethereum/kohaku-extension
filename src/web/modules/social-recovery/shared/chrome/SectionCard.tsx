import React from 'react'
import { View } from 'react-native'

import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'

import SectionLabel from './SectionLabel'
import type { SectionCardProps } from './types'

const BOTTOM_MARGIN = {
  block: spacings.mbLg,
  item: spacings.mbSm,
  none: spacings.mb0
} as const

const SectionCard = ({
  label,
  tone = 'plain',
  spacing = 'block',
  children,
  style,
  testID
}: SectionCardProps) => {
  const { theme } = useTheme()

  return (
    <View
      testID={testID}
      style={[
        common.borderRadiusSecondary,
        spacings.ph,
        spacings.pv,
        BOTTOM_MARGIN[spacing],
        {
          borderWidth: 1,
          borderColor: theme.secondaryBorder,
          backgroundColor: tone === 'muted' ? theme.secondaryBackground : theme.primaryBackground
        },
        style
      ]}
    >
      {!!label && <SectionLabel>{label}</SectionLabel>}
      {children}
    </View>
  )
}

export default React.memo(SectionCard)
