import React from 'react'
import { View } from 'react-native'

import SkeletonLoader from '@common/components/SkeletonLoader'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'

import getStyles from '../styles'

const Skeleton = () => {
  const { styles } = useTheme(getStyles)

  return (
    <View style={[spacings.phSm, spacings.ptSm, spacings.mbMi]}>
      <View style={[styles.contentContainer]}>
        <SkeletonLoader width="100%" height={150} />
      </View>
    </View>
  )
}

export default React.memo(Skeleton)
