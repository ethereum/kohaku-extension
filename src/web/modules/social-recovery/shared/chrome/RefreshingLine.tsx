/** The line beside content kept on screen while a fresh read runs. */
import React from 'react'

import { useTranslation } from '@common/config/localization'

import LoadingBlock from './LoadingBlock'
import type { RefreshingLineProps } from './types'

const RefreshingLine = ({
  messageKey = 'socialRecovery.loading.refreshing'
}: RefreshingLineProps) => {
  const { t } = useTranslation()

  return <LoadingBlock variant="row" message={t(messageKey)} />
}

export default React.memo(RefreshingLine)
