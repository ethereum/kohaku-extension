/**
 * A write step before its run starts: the re-authorize's own arrival, the
 * clear's sentence that it ends the recovery in progress, then the actions
 * once the stored write has been read, and the failed read of it with retry.
 */
import React from 'react'
import { View } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { ActionsRow } from '@web/modules/social-recovery/shared/chrome'
import LoadingBlock from '@web/modules/social-recovery/shared/chrome/LoadingBlock'
import ReadFailedBlock from '@web/modules/social-recovery/shared/chrome/ReadFailedBlock'

import { OVERVIEW } from './constants'
import type { WriteStepArrivalProps } from './types'

const WriteStepArrival = ({
  children,
  clearCancels,
  reading,
  lookupFailed,
  onLookAgain,
  startAction,
  back
}: WriteStepArrivalProps) => {
  const { t } = useTranslation()
  return (
    <View>
      {children}
      {clearCancels && (
        <Text
          fontSize={14}
          weight="medium"
          style={spacings.mtSm}
          testID="overview-step-clear-cancels"
        >
          {t(`${OVERVIEW}.dormant.clearCancels`)}
        </Text>
      )}
      {reading ? (
        <View testID="overview-step-lookup" style={spacings.mtSm}>
          <LoadingBlock variant="row" message={t('socialRecovery.loading.unfinishedSave')} />
        </View>
      ) : (
        <ActionsRow primary={startAction} secondary={back} />
      )}
      {lookupFailed && (
        <ReadFailedBlock
          testID="overview-step-lookup-failed"
          title={t('socialRecovery.records.loadFailed')}
          onRetry={onLookAgain}
        />
      )}
    </View>
  )
}

export default React.memo(WriteStepArrival)
