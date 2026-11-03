/** Why a write step cannot run for the account: its facts unread, or a key that only views. */
import React from 'react'

import Alert from '@common/components/Alert'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import ReadFailedBlock from '@web/modules/social-recovery/shared/chrome/ReadFailedBlock'

import type { WriteStepUnavailableProps } from './types'

const WriteStepUnavailable = ({ accountFacts }: WriteStepUnavailableProps) => {
  const { t } = useTranslation()
  if (accountFacts.status === 'unavailable') {
    return (
      <ReadFailedBlock
        testID="overview-step-unavailable"
        title={t('socialRecovery.client.unavailableTitle')}
        body={
          accountFacts.cause === 'not-listed'
            ? t('socialRecovery.arm.notListed')
            : t('socialRecovery.client.unavailableBody')
        }
        onRetry={accountFacts.retry}
      />
    )
  }
  if (accountFacts.status === 'ready' && !accountFacts.facts.key) {
    return (
      <Alert
        testID="overview-step-view-only"
        type="error"
        size="sm"
        style={spacings.mbSm}
        title={t('socialRecovery.client.unavailableTitle')}
        text={t('socialRecovery.arm.viewOnly')}
      />
    )
  }
  return null
}

export default React.memo(WriteStepUnavailable)
