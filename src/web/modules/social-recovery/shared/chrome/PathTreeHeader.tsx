import React, { useCallback, useContext, useRef } from 'react'
import { findNodeHandle, View } from 'react-native'

import { PathTreeHeaderContext } from './pathTreeContext'
import type { PathTreeHeaderProps } from './types'

/**
 * The part of a branch its tick points at. Each time it is laid out it tells
 * the branch where its middle sits, measured from the branch's top, so the
 * tick follows the header when it wraps or sits inside a card's padding.
 */
const PathTreeHeader = ({ children, style, testID }: PathTreeHeaderProps) => {
  const target = useContext(PathTreeHeaderContext)
  const header = useRef<View>(null)

  const onLayout = useCallback(() => {
    if (!target || !header.current) {
      return
    }
    const node = findNodeHandle(target.node.current)
    if (!node) {
      return
    }
    header.current.measureLayout(
      node,
      (_x, y, _width, height) => target.onMiddle(Math.round(y + height / 2)),
      () => {}
    )
  }, [target])

  return (
    <View ref={header} onLayout={onLayout} style={style} testID={testID}>
      {children}
    </View>
  )
}

export default React.memo(PathTreeHeader)
