/**
 * The reads in front of an editor screen while one has not returned.
 */
import React from 'react'
import { ActivityIndicator, View } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { OVERVIEW } from '@web/modules/social-recovery/management/overview/constants'

import type { ReadsBlockProps } from './types'

const ReadsLoading = ({ testID }: ReadsBlockProps) => {
  const { t } = useTranslation()
  return (
    <View testID={testID}>
      <ActivityIndicator style={spacings.mbSm} />
      <Text fontSize={14} appearance="secondaryText">
        {t(`${OVERVIEW}.reads.loading`)}
      </Text>
    </View>
  )
}

export default React.memo(ReadsLoading)
