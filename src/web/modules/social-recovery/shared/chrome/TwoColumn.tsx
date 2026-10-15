import React from 'react'
import { View } from 'react-native'

import useWindowSize from '@common/hooks/useWindowSize'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

import type { TwoColumnProps } from './types'

const MAIN = { maxWidth: 600, width: '100%' } as const
const ASIDE_WIDTH = 280

const TwoColumn = ({ children, aside, testID }: TwoColumnProps) => {
  const { maxWidthSize } = useWindowSize()
  const sideBySide = !!aside && maxWidthSize('l')

  return (
    <View
      testID={testID}
      style={sideBySide ? [flexbox.directionRow, flexbox.alignStart] : undefined}
    >
      <View
        style={sideBySide ? [MAIN, flexbox.flex1] : MAIN}
        testID={testID ? `${testID}-main` : undefined}
      >
        {children}
      </View>
      {!!aside && (
        <View
          style={sideBySide ? [{ width: ASIDE_WIDTH }, spacings.mlLg] : [MAIN, spacings.mtLg]}
          testID={testID ? `${testID}-aside` : undefined}
        >
          {aside}
        </View>
      )}
    </View>
  )
}

export default React.memo(TwoColumn)
