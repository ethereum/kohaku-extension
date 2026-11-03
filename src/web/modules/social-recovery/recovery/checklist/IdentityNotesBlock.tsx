/**
 * An identity row's notes after a claim that did not pass: the note, the line
 * that names the failure's cause, and the retry where the outcome offers one.
 */
import React from 'react'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { ActionsRow } from '@web/modules/social-recovery/shared/chrome'

import type { IdentityNotesBlockProps } from './types'

const IdentityNotesBlock = ({ place, notes, busy, onRetry }: IdentityNotesBlockProps) => {
  const { t } = useTranslation()

  return (
    <>
      {!!notes.note && (
        <Text
          fontSize={14}
          appearance="errorText"
          style={spacings.mtTy}
          testID={`checklist-row-${place}-note`}
        >
          {t(notes.note)}
        </Text>
      )}
      {!!notes.cause && (
        <Text
          fontSize={12}
          appearance="secondaryText"
          style={spacings.mtTy}
          testID={`checklist-row-${place}-cause`}
        >
          {t(notes.cause)}
        </Text>
      )}
      {notes.retry && (
        <ActionsRow
          primary={
            <Button
              testID={`checklist-row-${place}-retry`}
              type="secondary"
              size="small"
              text={t('socialRecovery.ceremony.tryAgainAction')}
              disabled={busy}
              onPress={onRetry}
              hasBottomSpacing={false}
            />
          }
        />
      )}
    </>
  )
}

export default React.memo(IdentityNotesBlock)
