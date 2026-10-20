/**
 * The card of the committed setup's path. A setup the account authorizes
 * carries edit the path and remove recovery, with the overview's line while
 * an attempt is open.
 */
import React from 'react'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import { ActionsRow, SectionCard } from '@web/modules/social-recovery/shared/chrome'

import { OVERVIEW } from './constants'
import PathBody from './PathBody'
import type { PathBlockProps } from './types'

const PathBlock = ({
  reads,
  context,
  networkName,
  kind,
  attemptOpen,
  navigate
}: PathBlockProps) => {
  const { t } = useTranslation()
  return (
    <SectionCard testID="overview-path">
      <PathBody reads={reads} context={context} networkName={networkName} />
      {kind === 'set-up' && (
        <>
          {attemptOpen && (
            <Text
              fontSize={14}
              weight="medium"
              style={spacings.mtSm}
              testID="overview-path-pending"
            >
              {t(`${OVERVIEW}.path.pendingLine`)}
            </Text>
          )}
          <ActionsRow
            primary={
              <Button
                testID="overview-edit-path"
                type="primary"
                text={t(`${OVERVIEW}.path.editPath`)}
                onPress={() => navigate(WEB_ROUTES.socialRecoveryManageEdit)}
                hasBottomSpacing={false}
              />
            }
            secondary={
              <Button
                testID="overview-remove-recovery"
                type="secondary"
                text={t(`${OVERVIEW}.path.removeRecovery`)}
                onPress={() => navigate(WEB_ROUTES.socialRecoveryManageRemove)}
                hasBottomSpacing={false}
              />
            }
          />
        </>
      )}
    </SectionCard>
  )
}

export default React.memo(PathBlock)
