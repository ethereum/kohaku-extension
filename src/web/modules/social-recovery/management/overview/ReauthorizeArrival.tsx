/**
 * The re-authorize before it starts: the recovery password ask of a locked
 * path, the failed reads of the path and the level with their retries, a
 * wallet that must update, the reads running, the ask of a level that hides
 * the setup where this tab holds no password, then the trust list.
 */
import React from 'react'
import { ActivityIndicator } from 'react-native'

import Alert from '@common/components/Alert'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import ReadFailedBlock from '@web/modules/social-recovery/shared/chrome/ReadFailedBlock'
import TrustList from '@web/modules/social-recovery/setup/review/TrustList'

import { OVERVIEW } from './constants'
import PathLockedAsk from './PathLockedAsk'
import type { ReauthorizeArrivalProps } from './types'

const ReauthorizeArrival = ({
  reads,
  level,
  onRetryLevel,
  passwordMissing,
  rows,
  client,
  onRetryTrust
}: ReauthorizeArrivalProps) => {
  const { t } = useTranslation()
  const { path } = reads

  if (path.kind === 'locked') {
    return (
      <PathLockedAsk
        testID="overview-step-locked"
        ask={reads.ask}
        onUnlock={reads.unlock}
        onAskAgain={reads.askAgain}
        onRetry={reads.retryPath}
        bare
      />
    )
  }
  if (path.kind === 'read-failed') {
    return (
      <ReadFailedBlock
        testID="overview-step-path-failed"
        title={t(`${OVERVIEW}.reads.failedTitle`)}
        body={t(`${OVERVIEW}.reads.failedBody`)}
        onRetry={reads.retryPath}
      />
    )
  }
  if (level.status === 'failed') {
    return (
      <ReadFailedBlock
        testID="overview-step-level-failed"
        title={t(`${OVERVIEW}.reads.failedTitle`)}
        body={t(`${OVERVIEW}.reads.failedBody`)}
        onRetry={onRetryLevel}
      />
    )
  }
  if (level.status === 'unreadable') {
    return (
      <Alert
        testID="overview-step-update-the-wallet"
        type="error"
        size="sm"
        style={spacings.mbSm}
        title={t('socialRecovery.client.updateTheWalletTitle')}
        text={t('socialRecovery.client.updateTheWalletHow')}
      />
    )
  }
  if (path.kind !== 'readable' || level.status === 'pending') {
    return <ActivityIndicator testID="overview-step-reading" style={spacings.mbSm} />
  }
  if (passwordMissing) {
    return (
      <PathLockedAsk
        testID="overview-step-password"
        ask={reads.ask}
        onUnlock={reads.unlock}
        onAskAgain={reads.askAgain}
        onRetry={reads.retryPath}
        bare
      />
    )
  }
  return <TrustList rows={rows} client={client} onRetry={onRetryTrust} />
}

export default React.memo(ReauthorizeArrival)
