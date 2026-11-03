import React from 'react'
import { View } from 'react-native'

import AmbireLogoHorizontal from '@common/components/AmbireLogoHorizontal'
import { getPanelPaddings } from '@common/components/Panel/Panel'
import Text from '@common/components/Text'
import useWindowSize from '@common/hooks/useWindowSize'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { SETTINGS_HEADER_HEIGHT } from '@web/modules/settings/contexts/SettingsRoutesContext/styles'

import type { PlainHeaderProps } from './types'

// The header keeps the side gutter of the panel under it, so the logo lines up
// with the screen's content.
const PlainHeader = ({ title, testID }: PlainHeaderProps) => {
  const { maxWidthSize } = useWindowSize()
  const { paddingHorizontal } = getPanelPaddings(maxWidthSize, 'large')

  return (
    <View
      testID={testID}
      style={[
        flexbox.directionRow,
        flexbox.alignCenter,
        { height: SETTINGS_HEADER_HEIGHT, paddingHorizontal }
      ]}
    >
      <AmbireLogoHorizontal />
      {!!title && (
        <Text fontSize={16} weight="medium" style={spacings.mlSm}>
          {title}
        </Text>
      )}
    </View>
  )
}

export default React.memo(PlainHeader)
