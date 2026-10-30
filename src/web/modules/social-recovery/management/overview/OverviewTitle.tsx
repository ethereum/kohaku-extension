/** The overview's title, with the line under it where the overview has read the account. */
import React from 'react'

import { useTranslation } from '@common/config/localization'
import { PageTitle } from '@web/modules/social-recovery/shared/chrome'

import { OVERVIEW } from './constants'
import type { OverviewTitleProps } from './types'

const OverviewTitle = ({ lead }: OverviewTitleProps) => {
  const { t } = useTranslation()
  return <PageTitle title={t(`${OVERVIEW}.title`)} lead={lead} titleTestID="overview-title" />
}

export default React.memo(OverviewTitle)
