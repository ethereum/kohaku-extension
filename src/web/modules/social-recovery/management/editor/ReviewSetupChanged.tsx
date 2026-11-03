/**
 * The save that found the setup changed on the chain since the edit opened,
 * with the way back to the editor.
 */
import React from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { ActionsRow } from '@web/modules/social-recovery/shared/chrome'

import { REVIEW } from './constants'
import type { ReviewSetupChangedProps } from './types'

const ReviewSetupChanged = ({ backToEditor }: ReviewSetupChangedProps) => {
  const { t } = useTranslation()
  return (
    <View testID="manage-review-setup-changed">
      <Alert
        type="warning"
        size="sm"
        style={spacings.mbSm}
        title={t('socialRecovery.records.setupChangedTitle')}
        text={t(`${REVIEW}.setupChangedBody`)}
      />
      <ActionsRow primary={backToEditor} />
    </View>
  )
}

export default React.memo(ReviewSetupChanged)
