/** The entry to the Recovery Card of a committed setup. */
import React from 'react'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import { ActionsRow, SectionCard } from '@web/modules/social-recovery/shared/chrome'

import { OVERVIEW } from './constants'
import type { OverviewNavigateProps } from './types'

const CardEntry = ({ navigate }: OverviewNavigateProps) => {
  const { t } = useTranslation()
  return (
    <SectionCard tone="muted" testID="overview-card">
      <Text fontSize={16} weight="medium" style={spacings.mbTy}>
        {t(`${OVERVIEW}.card.title`)}
      </Text>
      <Text fontSize={12} appearance="secondaryText" style={spacings.mbTy}>
        {t(`${OVERVIEW}.card.body`)}
      </Text>
      <ActionsRow
        primary={
          <Button
            testID="overview-card-open"
            type="secondary"
            size="small"
            text={t(`${OVERVIEW}.card.action`)}
            onPress={() => navigate(WEB_ROUTES.socialRecoverySetupCard)}
            hasBottomSpacing={false}
          />
        }
      />
    </SectionCard>
  )
}

export default React.memo(CardEntry)
