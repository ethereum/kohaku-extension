/**
 * An Aadhaar row: the holder uploads a fresh QR code of the same identity
 * they enrolled with, in the ceremony's full tab, where the proof runs with
 * its progress. A claim
 * that did not pass leaves its note, the cause of a failure, and a retry.
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

const AADHAAR = 'socialRecovery.checklist.aadhaar'

const AadhaarRow = ({ row, state, request, outcome, busy, launch }: IdentityClaimRowProps) => {
  const { t } = useTranslation()
  const { place } = row
  const notes = identityNotesOf(outcome, 'aadhaar')
  const stopped = !!notes.note
  const open = !state.replied && state.chip !== 'notNeeded'

  const body = () => {
    if (!open || !request) {
      return null
    }
    return (
      <>
        <Text fontSize={14} style={spacings.mtTy} testID={`checklist-row-${place}-lead`}>
          {t(`${AADHAAR}.lead`)}
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
                testID={`checklist-row-${place}-upload`}
                type="primary"
                size="small"
                text={t(`${AADHAAR}.uploadAction`)}
                disabled={busy}
                onPress={() => launch(request)}
                hasBottomSpacing={false}
              />
            }
          />
        )}
        <View style={spacings.mtSm}>
          <Text
            fontSize={12}
            appearance="secondaryText"
            style={spacings.mtTy}
            testID={`checklist-row-${place}-same-qr`}
          >
            {t(`${AADHAAR}.sameQr`)}
          </Text>
        </View>
      </>
    )
  }

  return (
    <RowFrame
      row={row}
      state={state}
      title={t('socialRecovery.methodNames.aadhaar')}
      label={row.gatheringPlace.label?.trim() || undefined}
    >
      {body()}
    </RowFrame>
  )
}

export default React.memo(AadhaarRow)
