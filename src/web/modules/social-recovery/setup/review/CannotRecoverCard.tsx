import React from 'react'
import { View } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { SectionCard, StatusChip } from '@web/modules/social-recovery/shared/chrome'
import { chipKey } from '@web/modules/social-recovery/shared/display'
import type { Translate } from '@web/modules/social-recovery/shared/display'

import type { CannotRecoverBlock, CannotRecoverCardProps } from './types'

const CANNOT_RECOVER = 'socialRecovery.review.blocked.cannotRecover'

const reasonOf = (blocked: CannotRecoverBlock, t: Translate): string => {
  if (blocked.reason === 'not-supported') {
    return t(`${CANNOT_RECOVER}.reasonNotSupported`)
  }
  return blocked.count === undefined
    ? t(`${CANNOT_RECOVER}.reasonSeveralKeys`)
    : t(`${CANNOT_RECOVER}.reasonKeyCount`, { count: blocked.count })
}

/** That this release cannot recover the account, with the reason; nothing on screen clears it. */
const CannotRecoverCard = ({ blocked }: CannotRecoverCardProps) => {
  const { t } = useTranslation()

  return (
    <SectionCard testID="review-blocked-cannot-recover">
      <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap, spacings.mbTy]}>
        <StatusChip
          text={t(chipKey('recovery', 'cannotRecover'))}
          tone="error"
          testID="review-blocked-chip"
          style={spacings.mrSm}
        />
        <Text fontSize={16} weight="medium" testID="review-blocked-title">
          {t(`${CANNOT_RECOVER}.title`)}
        </Text>
      </View>
      <Text
        fontSize={14}
        appearance="secondaryText"
        style={spacings.mbTy}
        testID="review-blocked-body"
      >
        {reasonOf(blocked, t)}
      </Text>
    </SectionCard>
  )
}

export default CannotRecoverCard
