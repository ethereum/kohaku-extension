import React, { Children, isValidElement } from 'react'
import type { ReactElement } from 'react'
import { View } from 'react-native'

import { PathTreeLabelContext, PathTreeSegmentContext } from './pathTreeContext'
import type { PathTreeNodeProps, PathTreeProps, PathTreeSegment } from './types'

const segmentOf = (
  isBranch: boolean,
  index: number,
  firstBranch: number,
  lastBranch: number
): PathTreeSegment => {
  if (isBranch) {
    const above = index > firstBranch
    const below = index < lastBranch
    if (above && below) {
      return 'full'
    }
    if (above) {
      return 'top'
    }
    if (below) {
      return 'bottom'
    }
    return 'none'
  }
  return index > firstBranch && index < lastBranch ? 'full' : 'none'
}

/**
 * One path drawn as a tree: a line on the left runs from the first branch
 * down to the last, ticks into each branch and passes beside every node
 * between them. A path of one branch draws no line.
 */
const PathTree = ({ children, label, style, testID }: PathTreeProps) => {
  const nodes = Children.toArray(children).filter((node): node is ReactElement<PathTreeNodeProps> =>
    isValidElement(node)
  )
  const isBranch = nodes.map((node) => (node.props.variant ?? 'branch') === 'branch')
  const firstBranch = isBranch.indexOf(true)
  const lastBranch = isBranch.lastIndexOf(true)

  return (
    <PathTreeLabelContext.Provider value={label}>
      <View testID={testID} style={style}>
        {nodes.map((node, index) => (
          <PathTreeSegmentContext.Provider
            key={node.key ?? index}
            value={segmentOf(isBranch[index], index, firstBranch, lastBranch)}
          >
            {node}
          </PathTreeSegmentContext.Provider>
        ))}
      </View>
    </PathTreeLabelContext.Provider>
  )
}

export default React.memo(PathTree)
