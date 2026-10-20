/**
 * The overview's reads in front of an editor screen: the setup read with its
 * loading and failed states, an account with no setup, then the path with the
 * recovery password ask where this device cannot read it, the committed
 * level, and the password again where the level hides the setup and this tab
 * holds none, since the save seals the backup under it. A screen that needs
 * no path renders once the setup read answered. Otherwise the screen renders
 * once every read answered; a read that failed or has not returned never
 * renders as an answer.
 */
import React from 'react'
import { View } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { OVERVIEW } from '@web/modules/social-recovery/management/overview/constants'
import PathLockedAsk from '@web/modules/social-recovery/management/overview/PathLockedAsk'

import ReadsFailed from './ReadsFailed'
import ReadsLoading from './ReadsLoading'
import ReadsUpdateTheWallet from './ReadsUpdateTheWallet'
import type { CommittedLevel, ReadsGateProps } from './types'

const PENDING: CommittedLevel = { status: 'pending' }

const ReadsGate = ({
  reads,
  level = PENDING,
  onRetryLevel,
  passwordHeld = false,
  needsPath = true,
  testID,
  children
}: ReadsGateProps) => {
  const { t } = useTranslation()

  const { facts, path } = reads
  const reading = <ReadsLoading testID={`${testID}-reading`} />
  const updateTheWallet = <ReadsUpdateTheWallet testID={`${testID}-update-the-wallet`} />
  if (facts.status === 'pending') {
    return reading
  }
  if (facts.status === 'failed') {
    return <ReadsFailed onRetry={reads.retry} testID={`${testID}-facts-failed`} />
  }
  if (facts.status === 'update-the-wallet') {
    return updateTheWallet
  }
  if (!facts.value.setup.hasSetup) {
    return (
      <Text fontSize={14} testID={`${testID}-not-set-up`}>
        {t(`${OVERVIEW}.lead.notSetUp`)}
      </Text>
    )
  }
  if (!needsPath) {
    return <View testID={testID}>{children}</View>
  }
  switch (path.kind) {
    case 'locked':
      return (
        <PathLockedAsk
          testID={`${testID}-locked`}
          ask={reads.ask}
          onUnlock={reads.unlock}
          onAskAgain={reads.askAgain}
          onRetry={reads.retryPath}
        />
      )
    case 'update-the-wallet':
      return updateTheWallet
    case 'read-failed':
    case 'no-details':
    case 'mismatch':
      return <ReadsFailed onRetry={reads.retryPath} testID={`${testID}-path-failed`} />
    case 'readable':
      break
    default:
      return reading
  }
  if (level.status === 'pending') {
    return reading
  }
  if (level.status === 'failed') {
    return <ReadsFailed onRetry={onRetryLevel ?? reads.retry} testID={`${testID}-level-failed`} />
  }
  if (level.status === 'unreadable') {
    return updateTheWallet
  }
  if (level.value !== 'public' && !passwordHeld) {
    return (
      <View testID={`${testID}-password`}>
        <Text fontSize={14} style={spacings.mbSm}>
          {t(`${OVERVIEW}.locked.body`)}
        </Text>
        <PathLockedAsk
          testID={`${testID}-password-ask`}
          ask={reads.ask}
          onUnlock={reads.unlock}
          onAskAgain={reads.askAgain}
          onRetry={reads.retryPath}
          bare
        />
      </View>
    )
  }
  return <View testID={testID}>{children}</View>
}

export default React.memo(ReadsGate)
