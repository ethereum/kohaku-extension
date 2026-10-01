/**
 * The passkey row's closing notes: a report that never came back, a passkey
 * the path already holds, and a write the records refused, each with its
 * retry where one exists.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

import type { PasskeyRowNotesProps } from './types'

const PasskeyRowNotes = ({
  undelivered,
  stale,
  canRetryUndelivered,
  retryUndelivered,
  duplicate,
  writeFailed,
  pending,
  busy,
  place
}: PasskeyRowNotesProps) => {
  const { t } = useTranslation()

  return (
    <>
      {undelivered && (
        <View style={[flexbox.directionRow, flexbox.alignCenter]}>
          <Text
            testID="passkey-undelivered"
            fontSize={14}
            appearance="errorText"
            style={spacings.mrSm}
          >
            {t('socialRecovery.ceremony.undeliveredNote')}
          </Text>
          {!!stale && (
            <Button
              testID="passkey-undelivered-retry"
              type="outline"
              text={t('socialRecovery.ceremony.tryAgainAction')}
              disabled={!canRetryUndelivered}
              onPress={retryUndelivered}
              hasBottomSpacing={false}
            />
          )}
        </View>
      )}
      {duplicate && (
        <Text testID="passkey-duplicate" fontSize={14} appearance="errorText">
          {t('socialRecovery.editor.duplicate')}
        </Text>
      )}
      {writeFailed && (
        <View style={[flexbox.directionRow, flexbox.alignCenter]}>
          <Text
            testID="enroll-write-failed"
            fontSize={14}
            appearance="errorText"
            style={spacings.mrSm}
          >
            {t('socialRecovery.records.writeFailed')}
          </Text>
          {!!pending && (
            <Button
              testID="passkey-place-retry"
              type="outline"
              text={t('socialRecovery.writes.tryAgain')}
              disabled={busy}
              onPress={() => place(pending)}
              hasBottomSpacing={false}
            />
          )}
        </View>
      )}
    </>
  )
}

export default React.memo(PasskeyRowNotes)
