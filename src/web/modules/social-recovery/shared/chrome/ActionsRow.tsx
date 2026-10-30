import React from 'react'
import { View } from 'react-native'

import Text from '@common/components/Text'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

import type { ActionsRowProps } from './types'

const ActionsRow = ({ primary, secondary, note, noteTestID, testID }: ActionsRowProps) => (
  <View testID={testID} style={spacings.mtSm}>
    <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap]}>
      {primary}
      {!!secondary && (
        <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mlSm]}>{secondary}</View>
      )}
    </View>
    {!!note && (
      <Text fontSize={12} appearance="secondaryText" style={spacings.mtTy} testID={noteTestID}>
        {note}
      </Text>
    )}
  </View>
)

export default React.memo(ActionsRow)
