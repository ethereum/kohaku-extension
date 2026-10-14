/**
 * The recovery password ask at a hidden level: the field and unlock, the
 * check running, the wrong password's blocker with the pointer to the card,
 * and the failed read of the setup event. The restore reads that event before
 * it can judge the password, so the failure never says the password worked.
 * Each state keeps the line that the account has a recovery setup, and a
 * disabled continue with the reason under it: nothing goes on until the
 * password opens the setup. The field's value lives in this component alone
 * and is emptied once a check starts.
 */
import React, { useCallback, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'

import Button from '@common/components/Button'
import InputPassword from '@common/components/InputPassword'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { ActionsRow, NoteBox, SectionCard } from '@web/modules/social-recovery/shared/chrome'
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

  const lockedContinue = (
    <Button
      testID="readout-continue-locked"
      type="primary"
      text={t('socialRecovery.actions.continue')}
      disabled
      hasBottomSpacing={false}
    />
  )
  const reason = t(`${READOUT}.locked.cannotBegin`)

  const configured = (
    <Text fontSize={14} appearance="secondaryText" testID="readout-configured">
      {t(CONFIGURED)}
    </Text>
  )

  if (unlock.status === 'checking') {
    return (
      <View testID="readout-unlock-checking">
        <ActivityIndicator style={spacings.mbSm} />
        <Text fontSize={14} appearance="secondaryText" style={spacings.mbTy}>
          {level === 'private'
            ? t(`${READOUT}.reading`, { network: networkName })
            : t(`${READOUT}.readingDetails`)}
        </Text>
        {configured}
        <ActionsRow primary={lockedContinue} note={reason} noteTestID="readout-continue-reason" />
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
        <ActionsRow
          primary={lockedContinue}
          secondary={back}
          note={reason}
          noteTestID="readout-continue-reason"
        />
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
        <ActionsRow
          primary={lockedContinue}
          secondary={back}
          note={reason}
          noteTestID="readout-continue-reason"
        />
      </View>
    )
  }

  return (
    <View testID="readout-locked">
      <SectionCard>
        {level === 'private' && (
          <>
            <Text fontSize={16} weight="medium" style={spacings.mbTy} testID="readout-locked-title">
              {t(`${READOUT}.locked.title`)}
            </Text>
            <Text fontSize={14} style={spacings.mbSm}>
              {t(`${READOUT}.locked.enterPassword`)}
            </Text>
          </>
        )}
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
      <NoteBox testID="readout-two-passwords">{t(`${READOUT}.twoPasswords.body`)}</NoteBox>
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
        secondary={
          <>
            {lockedContinue}
            <View style={spacings.mlSm}>{back}</View>
          </>
        }
        note={reason}
        noteTestID="readout-continue-reason"
      />
    </View>
  )
}

export default React.memo(ReadoutPasswordAsk)
