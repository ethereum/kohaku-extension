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
    <View testID="guardian-enrolled" style={spacings.mbSm}>
      <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mbTy]}>
        <Avatar pfp={address} isSmart={false} size={32} displayTypeBadge={false} />
        <Text testID="guardian-name" fontSize={16} weight="medium" style={spacings.mrSm}>
          {resolved ? resolved.name : renderShortAddress(address)}
        </Text>
        <Text fontSize={12} appearance="secondaryText" style={spacings.mrSm}>
          {renderNoun('guardian', t)}
        </Text>
        <Text testID="guardian-chip" fontSize={12} weight="medium" appearance="secondaryText">
          {renderChip('method', TEST_CHIPS[enrollment.test], t)}
        </Text>
      </View>
      {!!resolved && (
        <>
          <Text testID="guardian-full-address" fontSize={14} selectable>
            {renderFullAddress(address)}
          </Text>
          {!!resolved.caveat && (
            <Text fontSize={12} appearance="secondaryText">
              {resolved.caveat}
            </Text>
          )}
        </>
      )}
    </View>
  )
}

export default React.memo(GuardianEnrolledSummary)
