/**
 * The passkey the slot holds: its name and test chip, the synced or
 * device-bound kind with what losing it means, and the origin it serves.
 */
import React from 'react'
import { View } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { lossLineKeyOf, renderKindLine } from '@web/modules/social-recovery/shared/ceremony'
import { MethodRow, StatusChip } from '@web/modules/social-recovery/shared/chrome'
import { renderChip } from '@web/modules/social-recovery/shared/display'

import { TEST_CHIPS } from './outcome'
import type { PasskeyEnrolledSummaryProps } from './types'

const PasskeyEnrolledSummary = ({ enrollment, platform }: PasskeyEnrolledSummaryProps) => {
  const { t } = useTranslation()
  const { facts } = enrollment

  return (
    <MethodRow>
      <View
        style={[
          flexbox.directionRow,
          flexbox.alignCenter,
          flexbox.justifySpaceBetween,
          spacings.mbTy
        ]}
      >
        <Text
          testID="passkey-label"
          fontSize={16}
          weight="medium"
          style={[flexbox.flex1, spacings.mrSm]}
        >
          {enrollment.credential.label}
        </Text>
        <StatusChip
          testID="passkey-chip"
          text={renderChip('method', TEST_CHIPS[enrollment.test], t)}
        />
      </View>
      {!!facts && (
        <Text testID="passkey-kind-line" fontSize={14} style={spacings.mbTy}>
          {renderKindLine(facts, platform, t)}
        </Text>
      )}
      {!!(facts ?? enrollment.backup) && (
        <Text testID="passkey-loss-line" fontSize={14} style={spacings.mbTy}>
          {t(lossLineKeyOf({ kind: facts?.kind ?? enrollment.backup ?? 'synced' }))}
        </Text>
      )}
      <Text testID="passkey-origin" fontSize={12} appearance="secondaryText">
        {t('socialRecovery.ceremony.passkeyOrigin')}
      </Text>
    </MethodRow>
  )
}

export default React.memo(PasskeyEnrolledSummary)
