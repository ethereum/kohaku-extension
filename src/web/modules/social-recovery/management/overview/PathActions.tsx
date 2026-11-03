/**
 * Edit the path and remove recovery, held while a fresh read runs.
 */
import React from 'react'

import Button from '@common/components/Button'
import { useTranslation } from '@common/config/localization'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import { ActionsRow } from '@web/modules/social-recovery/shared/chrome'

import { OVERVIEW } from './constants'
import type { PathActionsProps } from './types'

const PathActions = ({ disabled, navigate }: PathActionsProps) => {
  const { t } = useTranslation()
  return (
    <ActionsRow
      primary={
        <Button
          testID="overview-edit-path"
          type="primary"
          text={t(`${OVERVIEW}.path.editPath`)}
          disabled={disabled}
          onPress={() => navigate(WEB_ROUTES.socialRecoveryManageEdit)}
          hasBottomSpacing={false}
        />
      }
      secondary={
        <Button
          testID="overview-remove-recovery"
          type="secondary"
          text={t(`${OVERVIEW}.path.removeRecovery`)}
          disabled={disabled}
          onPress={() => navigate(WEB_ROUTES.socialRecoveryManageRemove)}
          hasBottomSpacing={false}
        />
      }
    />
  )
}

export default React.memo(PathActions)
