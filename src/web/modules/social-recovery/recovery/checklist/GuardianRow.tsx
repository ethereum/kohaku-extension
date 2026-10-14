/**
 * A guardian row: the guardian's short address, the chip, the verified line
 * once an approval is added, and the slot the row's carriers mount in. While
 * the row is open the recoverer can note it declined or unanswered, a note
 * one tap clears.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { renderNoun, renderShortAddress } from '@web/modules/social-recovery/shared/display'
import { guardianAddressOf } from '@web/modules/social-recovery/setup/review'

import GuardianCarriers from './GuardianCarriers'
import RowFrame from './RowFrame'
import type { GuardianRowProps } from './types'

const GUARDIAN = 'socialRecovery.checklist.guardian'

const GuardianRow = ({
  row,
  state,
  request,
  support,
  busy,
  setNote,
  addReply
}: GuardianRowProps) => {
  const { t } = useTranslation()
  const { place } = row
  const address = guardianAddressOf(row.gatheringPlace)
  const open = !state.replied && state.chip !== 'notNeeded'

  const noteButton = (key: string, testID: string, onPress: () => void, primary = false) => (
    <Button
      testID={testID}
      type={primary ? 'secondary' : 'ghost'}
      size="small"
      text={t(key)}
      disabled={busy}
      onPress={onPress}
      hasBottomSpacing={false}
      style={spacings.mrSm}
    />
  )

  return (
    <RowFrame
      row={row}
      state={state}
      title={renderNoun('guardian', t)}
      label={address ? renderShortAddress(address) : undefined}
    >
      {state.replied && (
        <Text fontSize={14} style={spacings.mtTy} testID={`checklist-row-${place}-verified`}>
          {t(`${GUARDIAN}.verified`)}
        </Text>
      )}
      <GuardianCarriers
        place={place}
        request={request}
        replied={state.replied}
        open={open}
        busy={busy}
        addReply={addReply}
        support={support}
      />
      {open && !state.note && (
        <View style={spacings.mtSm}>
          <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap]}>
            {noteButton(`${GUARDIAN}.markDeclined`, `checklist-row-${place}-mark-declined`, () =>
              setNote(place, 'declined')
            )}
            {noteButton(
              `${GUARDIAN}.markUnanswered`,
              `checklist-row-${place}-mark-unanswered`,
              () => setNote(place, 'unanswered')
            )}
          </View>
          <Text fontSize={12} appearance="secondaryText" style={spacings.mtTy}>
            {t(`${GUARDIAN}.noteLine`)}
          </Text>
        </View>
      )}
      {open && !!state.note && (
        <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap, spacings.mtSm]}>
          <Text
            fontSize={14}
            style={[flexbox.flex1, spacings.mrSm]}
            testID={`checklist-row-${place}-marked`}
          >
            {t(
              state.note === 'declined'
                ? `${GUARDIAN}.markedDeclined`
                : `${GUARDIAN}.markedUnanswered`
            )}
          </Text>
          {noteButton(
            `${GUARDIAN}.clear`,
            `checklist-row-${place}-clear`,
            () => setNote(place, null),
            true
          )}
        </View>
      )}
    </RowFrame>
  )
}

export default React.memo(GuardianRow)
