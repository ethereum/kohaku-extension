/**
 * A passport row: the holder's phone reads the passport's chip through the
 * zkPassport app, in the ceremony's full tab, and the row says what that
 * phone reads, the account and the new key, so a holder who borrows a phone
 * knows what its owner learns. A claim that did not pass leaves its note, the
 * cause of a failure, and a retry.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { ActionsRow } from '@web/modules/social-recovery/shared/chrome'

import { identityNotesOf } from './identity'
import IdentityNotesBlock from './IdentityNotesBlock'
import RowFrame from './RowFrame'
import type { IdentityClaimRowProps } from './types'

const PASSPORT = 'socialRecovery.checklist.passport'

const PassportRow = ({ row, state, request, outcome, busy, launch }: IdentityClaimRowProps) => {
  const { t } = useTranslation()
  const { place } = row
  const notes = identityNotesOf(outcome, 'zkpassport')
  const stopped = !!notes.note
  const open = !state.replied && state.chip !== 'notNeeded'

  const line = (key: string, testID: string) => (
    <Text fontSize={12} appearance="secondaryText" style={spacings.mtTy} testID={testID}>
      {t(key)}
    </Text>
  )

  const body = () => {
    if (!open || !request) {
      return null
    }
    return (
      <>
        <Text fontSize={14} style={spacings.mtTy} testID={`checklist-row-${place}-lead`}>
          {t(`${PASSPORT}.lead`)}
        </Text>
        {stopped ? (
          <IdentityNotesBlock
            place={place}
            notes={notes}
            busy={busy}
            onRetry={() => launch(request)}
          />
        ) : (
          <ActionsRow
            primary={
              <Button
                testID={`checklist-row-${place}-scan`}
                type="primary"
                size="small"
                text={t(`${PASSPORT}.scanAction`)}
                disabled={busy}
                onPress={() => launch(request)}
                hasBottomSpacing={false}
              />
            }
          />
        )}
        <View style={spacings.mtSm}>
          {line('socialRecovery.ceremony.passportTunnel', `checklist-row-${place}-tunnel`)}
          {line(`${PASSPORT}.phoneReads`, `checklist-row-${place}-phone-reads`)}
          {line(`${PASSPORT}.borrowedPhone`, `checklist-row-${place}-borrowed-phone`)}
        </View>
      </>
    )
  }

  return (
    <RowFrame
      row={row}
      state={state}
      title={t('socialRecovery.methodNames.passport')}
      label={row.gatheringPlace.label?.trim() || undefined}
    >
      {body()}
    </RowFrame>
  )
}

export default React.memo(PassportRow)
