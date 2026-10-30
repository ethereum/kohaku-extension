/**
 * What a recovery screen shows until its entry record is read: the settings
 * chrome with a waiting block that names the read, or with the failed read and
 * its retry. A recovery
 * leaves the setup tab's account alone, so the chrome skips the account latch.
 */
import React from 'react'
import { View } from 'react-native'
import { useTranslation } from '@common/config/localization'
import flexbox from '@common/styles/utils/flexbox'

import LoadingBlock from './LoadingBlock'
import ReadFailedBlock from './ReadFailedBlock'
import SetupChrome from './SetupChrome'
import type { EntryReadFallbackProps } from './types'

const EntryReadFallback = ({
  testPrefix,
  titleKey,
  bodyKey,
  loadingKey,
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
        <View testID={`${testPrefix}-entry-loading`} style={flexbox.flex1}>
          <LoadingBlock variant="screen" message={t(loadingKey)} />
        </View>
      )}
    </SetupChrome>
  )
}

export default React.memo(EntryReadFallback)
