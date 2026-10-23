/**
 * The recovery password ask at a hidden level: the field and unlock, the
 * check running, the wrong password's blocker with the pointer to the card,
 * and the failed read of the setup event. The restore reads that event before
 * it can judge the password, so the failure never says the password worked.
 * Each state keeps the line that the account has a recovery setup; no
 * continue shows until the password opens the setup. The field's value lives
 * in this component alone and is emptied once a check starts.
 */
import React, { useCallback, useState } from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import InputPassword from '@common/components/InputPassword'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { ActionsRow, SectionCard } from '@web/modules/social-recovery/shared/chrome'
import LoadingBlock from '@web/modules/social-recovery/shared/chrome/LoadingBlock'
import ReadFailedBlock from '@web/modules/social-recovery/shared/chrome/ReadFailedBlock'
import { renderPasswordName } from '@web/modules/social-recovery/shared/display'

import type { ReadoutPasswordAskProps } from './types'

const READOUT = 'socialRecovery.readout'
const CONFIGURED = `${READOUT}.configuredLine`

const ReadoutPasswordAsk = ({
  level,
  unlock,
  networkName,
  onUnlock,
  onAskAgain,
  onRetry,
  onBack
}: ReadoutPasswordAskProps) => {
  const { t } = useTranslation()
  const [typed, setTyped] = useState('')

  const submit = useCallback(() => {
    if (!typed) {
      return
    }
    onUnlock(typed)
    setTyped('')
  }, [typed, onUnlock])

  const back = (
    <Button
      testID="readout-back"
      type="outline"
      text={t('socialRecovery.actions.back')}
      onPress={onBack}
      hasBottomSpacing={false}
    />
  )

  const configured = (
    <Text fontSize={14} appearance="secondaryText" testID="readout-configured">
      {t(CONFIGURED)}
    </Text>
  )

  if (unlock.status === 'checking') {
    return (
      <View testID="readout-unlock-checking">
        <LoadingBlock
          variant="block"
          message={
            level === 'private'
              ? t(`${READOUT}.reading`, { network: networkName })
              : t(`${READOUT}.readingDetails`)
          }
        />
        {configured}
      </View>
    )
  }

  if (unlock.status === 'wrong') {
    return (
      <View testID="readout-wrong-password">
        <ReadFailedBlock
          testID="readout-wrong-password-alert"
          retryTestID="readout-wrong-password-retry"
          title={t(`${READOUT}.wrongPassword.title`)}
          body={t(`${READOUT}.wrongPassword.cardPointer`)}
          onRetry={onAskAgain}
        />
        {configured}
        <ActionsRow primary={back} />
      </View>
    )
  }

  if (unlock.status === 'event-failed') {
    return (
      <View testID="readout-event-failed">
        <ReadFailedBlock
          testID="readout-event-failed-alert"
          retryTestID="readout-event-failed-retry"
          title={
            level === 'private'
              ? t(`${READOUT}.readFailedTitle`, { network: networkName })
              : t(`${READOUT}.detailsFailed`)
          }
          body={t(`${READOUT}.eventFailed.body`, { network: networkName })}
          onRetry={onRetry}
        />
        {configured}
        <ActionsRow primary={back} />
      </View>
    )
  }

  return (
    <View testID="readout-locked">
      <SectionCard>
        <InputPassword
          testID="readout-password-field"
          label={renderPasswordName('recoveryPassword', t)}
          accessibilityLabel={renderPasswordName('recoveryPassword', t)}
          value={typed}
          onChangeText={setTyped}
          onSubmitEditing={submit}
          containerStyle={spacings.mb0}
        />
        <Text fontSize={12} appearance="secondaryText" style={spacings.mtTy}>
          {t(`${READOUT}.locked.notExtensionPassword`)}
        </Text>
      </SectionCard>
      <ActionsRow
        primary={
          <Button
            testID="readout-unlock"
            type="primary"
            text={t(`${READOUT}.unlock`)}
            disabled={!typed}
            onPress={submit}
            hasBottomSpacing={false}
          />
        }
        secondary={back}
      />
    </View>
  )
}

export default React.memo(ReadoutPasswordAsk)
