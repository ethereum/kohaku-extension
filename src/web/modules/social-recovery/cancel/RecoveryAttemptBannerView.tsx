/**
 * One banner per smart account the wallet lists, whatever account is
 * selected. Where the wallet lists more than one account, each banner names
 * the account by the wallet's label and its truncated address, or by the
 * address alone where the label is empty.
 */
import React, { useMemo } from 'react'
import { View } from 'react-native'

import { sameAddress } from '@web/modules/social-recovery/shared/client'
import { watchedAccountsOf } from '@web/modules/social-recovery/watcher'

import AccountAttemptBanner from './AccountAttemptBanner'
import type { RecoveryAttemptBannerViewProps } from './types'

const RecoveryAttemptBannerView = ({
  accounts,
  useAttempt,
  useDismissed,
  heldKeys,
  onCancel,
  onDismiss,
  onRetry,
  timeZone
}: RecoveryAttemptBannerViewProps) => {
  const watched = useMemo(() => watchedAccountsOf(accounts), [accounts])
  const named = accounts.length > 1

  if (watched.length === 0) {
    return null
  }
  return (
    <View testID="recovery-banners">
      {watched.map((account) => {
        const listed = accounts.find((candidate) => sameAddress(candidate.addr, account))
        return (
          <AccountAttemptBanner
            key={account}
            account={account}
            name={named ? listed?.preferences?.label ?? '' : undefined}
            useAttempt={useAttempt}
            useDismissed={useDismissed}
            heldKeys={heldKeys}
            onCancel={onCancel}
            onDismiss={onDismiss}
            onRetry={onRetry}
            timeZone={timeZone}
          />
        )
      })}
    </View>
  )
}

export default React.memo(RecoveryAttemptBannerView)
