/**
 * The overview of a basic account, which this release cannot recover: the
 * refusal and the way to recover another account in place of the invitation
 * to set recovery up. It needs no chain read, so it shows as soon as the
 * wallet's list names the account's kind.
 */
import React, { useCallback } from 'react'
import { View } from 'react-native'

import { WEB_ROUTES } from '@common/modules/router/constants/common'
import { TwoColumn } from '@web/modules/social-recovery/shared/chrome'
import RecoverLink from '@web/modules/social-recovery/setup/presets/RecoverLink'
import CannotRecoverCard from '@web/modules/social-recovery/setup/review/CannotRecoverCard'

import OverviewTitle from './OverviewTitle'
import type { OverviewNavigateProps } from './types'

const CannotRecoverBlock = ({ navigate }: OverviewNavigateProps) => {
  const recover = useCallback(() => navigate(WEB_ROUTES.socialRecoveryRecovery), [navigate])
  return (
    <TwoColumn testID="overview-columns">
      <View testID="overview-cannot-recover">
        <OverviewTitle />
        <CannotRecoverCard blocked={{ kind: 'cannot-recover', reason: 'not-supported' }} />
        <RecoverLink onRecover={recover} />
      </View>
    </TwoColumn>
  )
}

export default React.memo(CannotRecoverBlock)
