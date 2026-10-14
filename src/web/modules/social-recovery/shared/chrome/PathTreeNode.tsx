import React, { useContext, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'

import Text from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

import {
  PATH_TREE_ANCHOR,
  PATH_TREE_GUTTER,
  PATH_TREE_LINE,
  PathTreeHeaderContext,
  PathTreeLabelContext,
  PathTreeSegmentContext
} from './pathTreeContext'
import type { PathTreeNodeProps } from './types'

const LINE_LEFT = (PATH_TREE_GUTTER - PATH_TREE_LINE) / 2

/**
 * One node of a path tree, its content right of the line's column. A branch
 * gets a tick from the line into its content, at the middle of the
 * `PathTreeHeader` inside it once that is laid out; a node the line only
 * passes keeps the column so every node's content starts at one edge.
 */
const PathTreeNode = ({
  children,
  variant = 'branch',
  anchor = PATH_TREE_ANCHOR,
  testID
}: PathTreeNodeProps) => {
  const { theme } = useTheme()
  const segment = useContext(PathTreeSegmentContext)
  const label = useContext(PathTreeLabelContext)
  const content = useRef<View>(null)
  const [headerMiddle, setHeaderMiddle] = useState<number>()
  const header = useMemo(() => ({ node: content, onMiddle: setHeaderMiddle }), [])
  const tick = headerMiddle ?? anchor
  const line = { position: 'absolute', left: LINE_LEFT, width: PATH_TREE_LINE } as const
  const color = { backgroundColor: theme.secondaryBorder }

  return (
    <View testID={testID} style={flexbox.directionRow}>
      <View style={{ width: PATH_TREE_GUTTER }}>
        {segment === 'full' && <View style={[line, color, { top: 0, bottom: 0 }]} />}
        {segment === 'top' && <View style={[line, color, { top: 0, height: tick }]} />}
        {segment === 'bottom' && <View style={[line, color, { top: tick, bottom: 0 }]} />}
        {variant === 'branch' && segment !== 'none' && (
          <View
            style={[
              color,
              {
                position: 'absolute',
                left: LINE_LEFT,
                top: tick - PATH_TREE_LINE / 2,
                width: PATH_TREE_GUTTER - LINE_LEFT,
                height: PATH_TREE_LINE
              }
            ]}
          />
        )}
      </View>
      <View ref={content} style={flexbox.flex1}>
        {variant === 'junction' ? (
          <Text fontSize={12} weight="semiBold" appearance="secondaryText" style={spacings.pbTy}>
            {label}
          </Text>
        ) : (
          <PathTreeHeaderContext.Provider value={header}>{children}</PathTreeHeaderContext.Provider>
        )}
      </View>
    </View>
  )
}

export default React.memo(PathTreeNode)
