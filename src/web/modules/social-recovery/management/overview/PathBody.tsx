/**
 * The path of the committed setup as this device reads it: reading, with the
 * path this device last opened beside a refreshing line where it holds one,
 * failed with retry, a wallet that must update, no details, details that do
 * not match, the recovery password ask of a locked path, or the path itself.
 */
import React, { useMemo } from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { readablePathOf } from '@web/modules/social-recovery/recovery/entry/readout'
import ReadoutPathBlock from '@web/modules/social-recovery/recovery/entry/ReadoutPathBlock'
import LoadingBlock from '@web/modules/social-recovery/shared/chrome/LoadingBlock'
import ReadFailedBlock from '@web/modules/social-recovery/shared/chrome/ReadFailedBlock'
import RefreshingLine from '@web/modules/social-recovery/shared/chrome/RefreshingLine'

import { OVERVIEW } from './constants'
import PathLockedAsk from './PathLockedAsk'
import type { PathBodyProps } from './types'

const PathBody = ({ reads, context, networkName }: PathBodyProps) => {
  const { t } = useTranslation()
  const { path } = reads

  // While the path is read, the one this device last opened stands in its place.
  const shown =
    (path.kind === 'readable' && path.configuration) ||
    (path.kind === 'reading' && reads.cached) ||
    null
  const readablePath = useMemo(
    () => (shown ? readablePathOf(shown, context, t) : null),
    [shown, context, t]
  )

  switch (path.kind) {
    case 'reading':
      return readablePath ? (
        <>
          <View testID="overview-path-refreshing" style={spacings.mbSm}>
            <RefreshingLine messageKey="socialRecovery.loading.refreshingSetup" />
          </View>
          <ReadoutPathBlock path={readablePath} />
        </>
      ) : (
        <View testID="overview-path-reading">
          <LoadingBlock variant="block" message={t('socialRecovery.loading.lookup')} />
        </View>
      )
    case 'read-failed':
      return (
        <ReadFailedBlock
          testID="overview-path-failed"
          title={t(`${OVERVIEW}.reads.failedTitle`)}
          body={t(`${OVERVIEW}.reads.failedBody`)}
          onRetry={reads.retryPath}
        />
      )
    case 'no-details':
      return (
        <Alert
          testID="overview-path-no-details"
          type="warning"
          size="sm"
          title={t('socialRecovery.readout.noDetails')}
        />
      )
    case 'mismatch':
      return (
        <Alert
          testID="overview-path-mismatch"
          type="error"
          size="sm"
          title={t('socialRecovery.readout.detailsMismatch', { network: networkName })}
        />
      )
    case 'locked':
      return (
        <PathLockedAsk
          testID="overview-locked"
          ask={reads.ask}
          onUnlock={reads.unlock}
          onAskAgain={reads.askAgain}
          onRetry={reads.retryPath}
        />
      )
    case 'readable':
      return readablePath ? <ReadoutPathBlock path={readablePath} /> : null
    default:
      return null
  }
}

export default React.memo(PathBody)
