/**
 * The status line: set up or not set up, path locked beside set up where this
 * device cannot read the path, not active for a dormant setup or a mirror, and
 * recovery in progress while an attempt is open.
 */
import React from 'react'
import { View } from 'react-native'

import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { StatusChip } from '@web/modules/social-recovery/shared/chrome'
import { renderChip } from '@web/modules/social-recovery/shared/display'

import type { OverviewChipsProps } from './types'

const OverviewChips = ({ kind, path, attemptOpen }: OverviewChipsProps) => {
  const { t } = useTranslation()
  return (
    <View
      style={[flexbox.directionRow, flexbox.wrap, flexbox.alignCenter, spacings.mbSm]}
      testID="overview-chips"
    >
      {kind === 'set-up' && (
        <StatusChip
          testID="overview-chip-set-up"
          tone="success"
          text={renderChip('recovery', 'setUp', t)}
          style={spacings.mrTy}
        />
      )}
      {kind === 'set-up' && path.kind === 'locked' && (
        <StatusChip
          testID="overview-chip-path-locked"
          tone="warning"
          text={renderChip('recovery', 'pathLocked', t)}
          style={spacings.mrTy}
        />
      )}
      {kind === 'not-set-up' && (
        <StatusChip
          testID="overview-chip-not-set-up"
          text={renderChip('recovery', 'notSetUp', t)}
          style={spacings.mrTy}
        />
      )}
      {(kind === 'dormant' || kind === 'mirror') && (
        <StatusChip
          testID="overview-chip-not-active"
          tone="warning"
          text={renderChip('recovery', 'notActive', t)}
          style={spacings.mrTy}
        />
      )}
      {attemptOpen && (
        <StatusChip
          testID="overview-chip-in-progress"
          tone="error"
          text={renderChip('attempt', 'recoveryInProgress', t)}
        />
      )}
    </View>
  )
}

export default React.memo(OverviewChips)
