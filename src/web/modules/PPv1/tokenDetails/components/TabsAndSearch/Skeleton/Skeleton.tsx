import React from 'react'
import { View } from 'react-native'

import SkeletonLoader from '@common/components/SkeletonLoader'
import { getUiType } from '@web/utils/uiType'

import styles from '../styles'

const { isTab } = getUiType()

const Skeleton = () => {
  return (
    <View style={[styles.container, { marginHorizontal: 0 }]}>
      <SkeletonLoader width={isTab ? 350 : 300} height={32} borderRadius={14} />
      <SkeletonLoader width={200} height={32} />
    </View>
  )
}

export default React.memo(Skeleton)
