/**
 * A ceremony row's closing notes: a report that never came back, a credential
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

import type { RowNotesProps } from './types'

const RowNotes = ({
  row,
  undelivered,
  staleWaiting,
  canRetryUndelivered,
  retryUndelivered,
  duplicate,
  writeFailed,
  retryPlace,
  busy
}: RowNotesProps) => {
  const { t } = useTranslation()

  return (
    <>
      {undelivered && (
        <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap, spacings.mbSm]}>
          <Text
            testID={`${row}-undelivered`}
            fontSize={14}
            appearance="errorText"
            style={spacings.mrSm}
          >
            {t('socialRecovery.ceremony.undeliveredNote')}
          </Text>
          {staleWaiting && (
            <Button
              testID={`${row}-undelivered-retry`}
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
            <Alert.Text size="sm" type="error" testID={`${row}-duplicate`}>
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
          {!!retryPlace && (
            <Button
              testID={`${row}-place-retry`}
              type="secondary"
              size="small"
              text={t('socialRecovery.writes.tryAgain')}
              disabled={busy}
              onPress={retryPlace}
              hasBottomSpacing={false}
              style={[flexbox.alignSelfStart, spacings.mtTy]}
            />
          )}
        </Alert>
      )}
    </>
  )
}

export default React.memo(RowNotes)
