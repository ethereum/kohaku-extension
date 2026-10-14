/**
 * What a recovery screen shows until its entry record is read: the settings
 * chrome with a spinner, or with the failed read and its retry. A recovery
 * leaves the setup tab's account alone, so the chrome skips the account latch.
 */
import React from 'react'
import { ActivityIndicator } from 'react-native'

import { useTranslation } from '@common/config/localization'

import ReadFailedBlock from './ReadFailedBlock'
import SetupChrome from './SetupChrome'
import type { EntryReadFallbackProps } from './types'

const EntryReadFallback = ({
  testPrefix,
  titleKey,
  bodyKey,
  failed,
  onRetry
}: EntryReadFallbackProps) => {
  const { t } = useTranslation()

  return (
    <SetupChrome testID={`${testPrefix}-screen`} skipAccountLatch>
      {failed ? (
        <ReadFailedBlock
          testID={`${testPrefix}-entry-failed`}
          retryTestID={`${testPrefix}-entry-retry`}
          title={t(titleKey)}
          body={t(bodyKey)}
          onRetry={onRetry}
        />
      ) : (
        <ActivityIndicator testID={`${testPrefix}-entry-loading`} />
      )}
    </SetupChrome>
  )
}

export default React.memo(EntryReadFallback)
