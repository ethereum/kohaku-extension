/**
 * The guardian the slot holds: the name it was added by, or else the short
 * address, with its test chip, and the full address under a name.
 */
import React from 'react'
import { View } from 'react-native'

import Avatar from '@common/components/Avatar'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { MethodRow, StatusChip } from '@web/modules/social-recovery/shared/chrome'
import {
  renderChip,
  renderFullAddress,
  renderNoun,
  renderResolvedName,
  renderShortAddress
} from '@web/modules/social-recovery/shared/display'

import { TEST_CHIPS } from './outcome'
import type { GuardianEnrolledSummaryProps } from './types'

const GuardianEnrolledSummary = ({
  enrollment,
  address,
  resolvedName
}: GuardianEnrolledSummaryProps) => {
  const { t } = useTranslation()
  const resolved = resolvedName ? renderResolvedName(resolvedName, 'besideAddressToCheck', t) : null

  return (
    <MethodRow testID="guardian-enrolled">
      <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
        <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.flex1, spacings.mrSm]}>
          <Avatar pfp={address} isSmart={false} size={24} displayTypeBadge={false} />
          <Text testID="guardian-name" fontSize={14} weight="medium" style={spacings.mrSm}>
            {resolved ? resolved.name : renderShortAddress(address)}
          </Text>
          <Text fontSize={12} appearance="secondaryText">
            {renderNoun('guardian', t)}
          </Text>
        </View>
        <StatusChip
          testID="guardian-chip"
          text={renderChip('method', TEST_CHIPS[enrollment.test], t)}
        />
      </View>
      {!!resolved && (
        <>
          <Text
            testID="guardian-full-address"
            fontSize={14}
            weight="number_medium"
            selectable
            style={spacings.mtTy}
          >
            {renderFullAddress(address)}
          </Text>
          {!!resolved.caveat && (
            <Text fontSize={12} appearance="secondaryText">
              {resolved.caveat}
            </Text>
          )}
        </>
      )}
    </MethodRow>
  )
}

export default React.memo(GuardianEnrolledSummary)
