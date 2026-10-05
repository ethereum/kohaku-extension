/**
 * The passkey row's closing notes: a report that never came back, a passkey
 * the path already holds, and a write the records refused, each with its
 * retry where one exists.
 */
import React from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
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
        <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap, spacings.mbSm]}>
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
              type="secondary"
              size="small"
              text={t('socialRecovery.ceremony.tryAgainAction')}
              disabled={!canRetryUndelivered}
              onPress={retryUndelivered}
              hasBottomSpacing={false}
            />
          )}
        </View>
      )}
      {duplicate && (
        <Alert
          type="error"
          size="sm"
          style={spacings.mbSm}
          text={
            <Alert.Text size="sm" type="error" testID="passkey-duplicate">
              {t('socialRecovery.editor.duplicate')}
            </Alert.Text>
          }
        />
      )}
      {writeFailed && (
        <Alert
          type="error"
          size="sm"
          style={spacings.mbSm}
          text={
            <Alert.Text size="sm" type="error" testID="enroll-write-failed">
              {t('socialRecovery.records.writeFailed')}
            </Alert.Text>
          }
        >
          {!!pending && (
            <Button
              testID="passkey-place-retry"
              type="secondary"
              size="small"
              text={t('socialRecovery.writes.tryAgain')}
              disabled={busy}
              onPress={() => place(pending)}
              hasBottomSpacing={false}
              style={[flexbox.alignSelfStart, spacings.mtTy]}
            />
          )}
        </Alert>
      )}
    </>
  )
}

export default React.memo(PasskeyRowNotes)
