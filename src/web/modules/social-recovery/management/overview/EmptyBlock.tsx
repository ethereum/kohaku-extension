/** An account with no setup and no authorization: the line and the way to set recovery up. */
import React from 'react'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import { ActionsRow, SectionCard } from '@web/modules/social-recovery/shared/chrome'

import { OVERVIEW } from './constants'
import type { OverviewNavigateProps } from './types'

const EmptyBlock = ({ navigate }: OverviewNavigateProps) => {
  const { t } = useTranslation()
  return (
    <SectionCard testID="overview-empty">
      <Text fontSize={14} style={spacings.mbTy} testID="overview-empty-body">
        {t(`${OVERVIEW}.empty.body`)}
      </Text>
      <ActionsRow
        primary={
          <Button
            testID="overview-set-up"
            type="primary"
            text={t(`${OVERVIEW}.empty.action`)}
            onPress={() => navigate(WEB_ROUTES.socialRecoverySetup)}
            hasBottomSpacing={false}
          />
        }
      />
    </SectionCard>
  )
}

export default React.memo(EmptyBlock)
