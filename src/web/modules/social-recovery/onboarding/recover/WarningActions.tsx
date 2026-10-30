/** The warning's continue, disabled until the acknowledgment, and its optional leave. */
import React from 'react'

import Button from '@common/components/Button'
import { useTranslation } from '@common/config/localization'
import { ActionsRow } from '@web/modules/social-recovery/shared/chrome'

import type { WarningActionsProps } from './types'

const WarningActions = ({ acknowledged, onContinue, onLeave, testID }: WarningActionsProps) => {
  const { t } = useTranslation()

  return (
    <ActionsRow
      testID={`${testID}-actions`}
      primary={
        <Button
          testID={`${testID}-continue`}
          type="primary"
          text={t('socialRecovery.actions.continue')}
          disabled={!acknowledged}
          onPress={onContinue}
          hasBottomSpacing={false}
        />
      }
      secondary={
        onLeave ? (
          <Button
            testID={`${testID}-leave`}
            type="outline"
            text={t('socialRecovery.recover.warning.leave')}
            onPress={onLeave}
            hasBottomSpacing={false}
          />
        ) : undefined
      }
    />
  )
}

export default React.memo(WarningActions)
