/**
 * The removal done: recovery is off on the account. A run that found the
 * setup and the authorization already gone sent nothing and says so apart.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import { ActionsRow, PageTitle } from '@web/modules/social-recovery/shared/chrome'

import { REMOVE } from './constants'
import type { RemoveDoneProps } from './types'

const RemoveDone = ({ endedElsewhere, onClose }: RemoveDoneProps) => {
  const { t } = useTranslation()
  return (
    <View testID={endedElsewhere ? 'manage-remove-ended' : 'manage-remove-done'}>
      <PageTitle
        title={t(endedElsewhere ? `${REMOVE}.alreadyTitle` : `${REMOVE}.doneTitle`)}
        titleTestID="manage-remove-done-title"
      >
        <Text fontSize={14} appearance="secondaryText" testID="manage-remove-done-lead">
          {t(endedElsewhere ? `${REMOVE}.alreadyBody` : `${REMOVE}.doneBody`)}
        </Text>
      </PageTitle>
      <ActionsRow
        primary={
          <Button
            testID="manage-remove-done-action"
            type="primary"
            text={t('socialRecovery.done.close')}
            onPress={onClose}
            hasBottomSpacing={false}
          />
        }
      />
    </View>
  )
}

export default React.memo(RemoveDone)
