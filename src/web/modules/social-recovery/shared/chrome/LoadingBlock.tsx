/**
 * A wait: the spinner and a line that says what the screen reads or does. The
 * screen variant fills its container and centres both ways, the block variant
 * centres across a card or section, and the row variant puts a small spinner
 * before the line.
 */
import React from 'react'
import { View } from 'react-native'

import Spinner from '@common/components/Spinner'
import Text from '@common/components/Text'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

import type { LoadingBlockProps } from './types'

const ROW_SPINNER = { width: 16, height: 16 }

const LoadingBlock = ({ message, variant }: LoadingBlockProps) => {
  if (variant === 'row') {
    return (
      <View testID="loading-row" style={[flexbox.directionRow, flexbox.alignCenter]}>
        <Spinner style={ROW_SPINNER} />
        <Text
          testID="loading-message"
          fontSize={12}
          appearance="primaryText"
          numberOfLines={1}
          style={spacings.mlTy}
        >
          {message}
        </Text>
      </View>
    )
  }

  return (
    <View
      testID={`loading-${variant}`}
      style={
        variant === 'screen'
          ? [flexbox.flex1, flexbox.center, spacings.ph, spacings.pv]
          : [flexbox.alignCenter, spacings.pvLg]
      }
    >
      <Spinner />
      <Text
        testID="loading-message"
        fontSize={14}
        appearance="primaryText"
        style={[spacings.mtSm, { textAlign: 'center' }]}
      >
        {message}
      </Text>
    </View>
  )
}

export default React.memo(LoadingBlock)
