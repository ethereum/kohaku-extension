/**
 * The body of the recovery password ask: the check running, the failed read
 * of the setup event with its retry, the locked notice's action, or the field
 * with the unlock and the wrong password's line over it.
 */
import React from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import InputPassword from '@common/components/InputPassword'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { ActionsRow } from '@web/modules/social-recovery/shared/chrome'
import LoadingBlock from '@web/modules/social-recovery/shared/chrome/LoadingBlock'
import ReadFailedBlock from '@web/modules/social-recovery/shared/chrome/ReadFailedBlock'

import { LOCKED, OVERVIEW } from './constants'
import type { PathLockedBodyProps } from './types'

const PathLockedBody = ({
  ask,
  asking,
  onAsk,
  typed,
  onChange,
  onSubmit,
  onRetry,
  testID
}: PathLockedBodyProps) => {
  const { t } = useTranslation()

  if (ask.status === 'checking') {
    return (
      <View testID={`${testID}-checking`}>
        <LoadingBlock variant="block" message={t('socialRecovery.loading.unlocking')} />
      </View>
    )
  }
  if (ask.status === 'event-failed') {
    return (
      <ReadFailedBlock
        testID={`${testID}-event-failed`}
        title={t(`${OVERVIEW}.reads.failedTitle`)}
        body={t(`${OVERVIEW}.reads.failedBody`)}
        onRetry={onRetry}
      />
    )
  }
  if (!asking) {
    return (
      <ActionsRow
        primary={
          <Button
            testID={`${testID}-action`}
            type="primary"
            text={t(`${LOCKED}.action`)}
            onPress={onAsk}
            hasBottomSpacing={false}
          />
        }
      />
    )
  }
  return (
    <View>
      {ask.status === 'wrong' && (
        <Alert
          testID={`${testID}-wrong`}
          type="error"
          size="sm"
          style={spacings.mbSm}
          text={t(`${LOCKED}.wrong`)}
        />
      )}
      <InputPassword
        testID={`${testID}-field`}
        label={t(`${LOCKED}.field`)}
        accessibilityLabel={t(`${LOCKED}.field`)}
        value={typed}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        placeholder={t(`${LOCKED}.passwordPlaceholder`)}
        containerStyle={spacings.mb0}
      />
      <ActionsRow
        primary={
          <Button
            testID={`${testID}-unlock`}
            type="primary"
            text={t(`${LOCKED}.unlock`)}
            disabled={!typed || ask.status !== 'idle'}
            onPress={onSubmit}
            hasBottomSpacing={false}
          />
        }
      />
    </View>
  )
}

export default React.memo(PathLockedBody)
