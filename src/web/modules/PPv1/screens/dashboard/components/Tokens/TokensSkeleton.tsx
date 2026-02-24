import React from 'react'
import { View } from 'react-native'

import spacings from '@common/styles/spacings'

interface SkeletonProps {
  amount?: number
  withHeader?: boolean
}

const Skeleton = ({ amount = 5, withHeader = true }: SkeletonProps) => {
  return (
    <View style={spacings.phTy}>
      {withHeader && (
        <View
          style={[spacings.mbLg, { height: 60, backgroundColor: '#e0e0e0', borderRadius: 8 }]}
        />
      )}
      {Array.from({ length: amount }).map((_, index) => (
        <View
          // eslint-disable-next-line react/no-array-index-key
          key={`skeleton-${index}`}
          style={[
            spacings.mbMi,
            { height: 60, backgroundColor: '#e0e0e0', borderRadius: 8, opacity: 0.5 }
          ]}
        />
      ))}
    </View>
  )
}

export default Skeleton
