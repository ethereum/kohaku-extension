/**
 * The reads in front of an editor screen while one has not returned.
 */
import React from 'react'
import { View } from 'react-native'

import { useTranslation } from '@common/config/localization'
import LoadingBlock from '@web/modules/social-recovery/shared/chrome/LoadingBlock'

import type { ReadsBlockProps } from './types'

const ReadsLoading = ({ testID }: ReadsBlockProps) => {
  const { t } = useTranslation()
  return (
    <View testID={testID}>
      <LoadingBlock variant="block" message={t('socialRecovery.loading.lookup')} />
    </View>
  )
}

export default React.memo(ReadsLoading)
