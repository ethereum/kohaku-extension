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
import { renderChip } from '@web/modules/social-recovery/shared/display'

import { TEST_CHIPS } from './outcome'
import type { PasskeyEnrolledSummaryProps } from './types'

const PasskeyEnrolledSummary = ({ enrollment, platform }: PasskeyEnrolledSummaryProps) => {
  const { t } = useTranslation()
  const { facts } = enrollment

  return (
    <>
      <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mbTy]}>
        <Text testID="passkey-label" fontSize={16} weight="medium" style={spacings.mrSm}>
          {enrollment.credential.label}
        </Text>
        <Text testID="passkey-chip" fontSize={12} weight="medium" appearance="secondaryText">
          {renderChip('method', TEST_CHIPS[enrollment.test], t)}
        </Text>
      </View>
      {!!facts && (
        <Text testID="passkey-kind-line" fontSize={14} weight="medium">
          {renderKindLine(facts, platform, t)}
        </Text>
      )}
      {!!(facts ?? enrollment.backup) && (
        <Text testID="passkey-loss-line" fontSize={14} style={spacings.mbTy}>
          {t(lossLineKeyOf({ kind: facts?.kind ?? enrollment.backup ?? 'synced' }))}
        </Text>
      )}
      <Text testID="passkey-origin" fontSize={12} appearance="secondaryText" style={spacings.mbSm}>
        {t('socialRecovery.ceremony.passkeyOrigin')}
      </Text>
    </>
  )
}

export default React.memo(PasskeyEnrolledSummary)
