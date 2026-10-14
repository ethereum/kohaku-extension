/**
 * One checklist row's frame: the method's kind name, its label, the
 * collection chip, and the row's body by kind below.
 */
import React from 'react'
import { View } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { MethodRow, StatusChip } from '@web/modules/social-recovery/shared/chrome'
import type { StatusChipTone } from '@web/modules/social-recovery/shared/chrome'
import { renderChip } from '@web/modules/social-recovery/shared/display'
import type { CollectionChip } from '@web/modules/social-recovery/shared/display'

import type { RowFrameProps } from './types'

const CHIP_TONES: Partial<Record<CollectionChip, StatusChipTone>> = {
  complete: 'success',
  declined: 'warning',
  unanswered: 'warning',
  didNotAnswer: 'error',
  stopped: 'error'
}

const RowFrame = ({ row, state, title, label, children }: RowFrameProps) => {
  const { t } = useTranslation()

  return (
    <MethodRow testID={`checklist-row-${row.place}`} quiet={state.chip === 'notNeeded'}>
      <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
        <View style={[flexbox.flex1, spacings.mrSm]}>
          <Text testID={`checklist-row-${row.place}-kind`} fontSize={14} weight="medium">
            {title}
          </Text>
          {!!label && (
            <Text testID={`checklist-row-${row.place}-label`} fontSize={12} weight="medium">
              {label}
            </Text>
          )}
        </View>
        <StatusChip
          testID={`checklist-row-${row.place}-chip`}
          text={renderChip('collection', state.chip, t)}
          tone={CHIP_TONES[state.chip] ?? 'default'}
        />
      </View>
      {children}
    </MethodRow>
  )
}

export default React.memo(RowFrame)
