/**
 * The edit that could not open the committed configuration into the setup
 * records, with the action that opens it again.
 */
import React from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import { useTranslation } from '@common/config/localization'
import { ActionsRow } from '@web/modules/social-recovery/shared/chrome'

import type { EditOpenFailedProps } from './types'

const EditOpenFailed = ({ onRetry }: EditOpenFailedProps) => {
  const { t } = useTranslation()
  return (
    <View testID="manage-edit-open-failed">
      <Alert type="error" size="sm" text={t('socialRecovery.records.loadFailed')} />
      <ActionsRow
        primary={
          <Button
            testID="manage-edit-open-retry"
            type="primary"
            text={t('socialRecovery.writes.tryAgain')}
            onPress={onRetry}
            hasBottomSpacing={false}
          />
        }
      />
    </View>
  )
}

export default React.memo(EditOpenFailed)
