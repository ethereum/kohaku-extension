/**
 * A poll of the account's recovery state that failed or ran past its limit:
 * over the rows, they may be out of date, the read says nothing about whether
 * the request lives and nothing goes on until a read succeeds; over a request
 * another attempt voided, the read could not tell whether that attempt still
 * runs. Either way, the retry.
 */
import React from 'react'

import Alert from '@common/components/Alert'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import ReadFailedBlock from '@web/modules/social-recovery/shared/chrome/ReadFailedBlock'

import type { PollAlertProps } from './types'

const POLL_FAILED = 'socialRecovery.checklist.pollFailed'

const PollAlert = ({ withRows, onRetry }: PollAlertProps) => {
  const { t } = useTranslation()

  return (
    <ReadFailedBlock
      testID="checklist-poll-failed"
      retryTestID="checklist-poll-retry"
      title={withRows ? t(`${POLL_FAILED}.title`) : t('socialRecovery.checklist.deaths.readFailed')}
      body={withRows ? t(`${POLL_FAILED}.body`) : undefined}
      onRetry={onRetry}
    >
      {withRows && (
        <Alert.Text size="sm" type="error" style={spacings.mtTy} testID="checklist-poll-held">
          {t(`${POLL_FAILED}.held`)}
        </Alert.Text>
      )}
    </ReadFailedBlock>
  )
}

export default React.memo(PollAlert)
