/**
 * The path of the committed setup as this device reads it: reading, failed
 * with retry, a wallet that must update, no details, details that do not
 * match, the recovery password ask of a locked path, or the path itself.
 */
import React, { useMemo } from 'react'
import { ActivityIndicator } from 'react-native'

import Alert from '@common/components/Alert'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { readablePathOf } from '@web/modules/social-recovery/recovery/entry/readout'
import ReadoutPathBlock from '@web/modules/social-recovery/recovery/entry/ReadoutPathBlock'
import ReadFailedBlock from '@web/modules/social-recovery/shared/chrome/ReadFailedBlock'

import { OVERVIEW } from './constants'
import PathLockedAsk from './PathLockedAsk'
import type { PathBodyProps } from './types'

const PathBody = ({ reads, context, networkName }: PathBodyProps) => {
  const { t } = useTranslation()
  const { path } = reads

  const readablePath = useMemo(
    () => (path.kind === 'readable' ? readablePathOf(path.configuration, context, t) : null),
    [path, context, t]
  )

  switch (path.kind) {
    case 'reading':
      return <ActivityIndicator testID="overview-path-reading" style={spacings.mbSm} />
    case 'read-failed':
      return (
        <ReadFailedBlock
          testID="overview-path-failed"
          title={t(`${OVERVIEW}.reads.failedTitle`)}
          body={t(`${OVERVIEW}.reads.failedBody`)}
          onRetry={reads.retryPath}
        />
      )
    case 'update-the-wallet':
      return (
        <Alert
          testID="overview-path-update-the-wallet"
          type="error"
          size="sm"
          title={t('socialRecovery.client.updateTheWalletTitle')}
          text={t('socialRecovery.client.updateTheWalletHow')}
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
