import React from 'react'
import { View } from 'react-native'

import SkeletonLoader from '@common/components/SkeletonLoader'
import spacings from '@common/styles/spacings'

const ActivityPositionsSkeleton = ({ amount = 5 }: { amount?: number }) => {
  // Needed so react keys are generated outside of the return statement
  const skeletonItems = Array.from({ length: amount }, (_, index) => {
    return { key: index }
  })

  return (
    <View style={[spacings.phTy, spacings.ptMi]}>
      {skeletonItems.map((item) => (
        <SkeletonLoader key={item.key} width="100%" height={96} style={spacings.mbTy} />
      ))}
    </View>
  )
}

export default React.memo(ActivityPositionsSkeleton)
