/**
 * A read in front of an editor screen that failed, with its retry.
 */
import React from 'react'

import { useTranslation } from '@common/config/localization'
import { OVERVIEW } from '@web/modules/social-recovery/management/overview/constants'
import ReadFailedBlock from '@web/modules/social-recovery/shared/chrome/ReadFailedBlock'

import type { ReadsFailedProps } from './types'

const ReadsFailed = ({ onRetry, testID }: ReadsFailedProps) => {
  const { t } = useTranslation()
  return (
    <ReadFailedBlock
      testID={testID}
      title={t(`${OVERVIEW}.reads.failedTitle`)}
      body={t(`${OVERVIEW}.reads.failedBody`)}
      onRetry={onRetry}
    />
  )
}

export default React.memo(ReadsFailed)
