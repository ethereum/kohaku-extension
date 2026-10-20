/**
 * The change of the recovery password: a new password typed twice, the
 * mismatch line while the two differ, and the action that keeps it for the
 * save. The fields' values live in this component alone.
 */
import React, { useState } from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import InputPassword from '@common/components/InputPassword'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { ActionsRow, SectionCard } from '@web/modules/social-recovery/shared/chrome'

import { EDITOR } from './constants'
import type { PasswordChangeProps } from './types'

const PASSWORD = `${EDITOR}.password`

const PasswordChange = ({ onDone, onCancel }: PasswordChangeProps) => {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const mismatch = confirmation !== '' && password !== confirmation
  const ready = password !== '' && password === confirmation

  return (
    <SectionCard label={t(`${PASSWORD}.action`)} testID="manage-password">
      <Text fontSize={14} appearance="secondaryText" style={spacings.mbSm}>
        {t(`${PASSWORD}.body`)}
      </Text>
      <View style={spacings.mbSm}>
        <InputPassword
          testID="manage-password-field"
          label={t(`${PASSWORD}.field`)}
          accessibilityLabel={t(`${PASSWORD}.field`)}
          value={password}
          onChangeText={setPassword}
        />
        <InputPassword
          testID="manage-password-confirm"
          label={t(`${PASSWORD}.confirmField`)}
          accessibilityLabel={t(`${PASSWORD}.confirmField`)}
          value={confirmation}
          onChangeText={setConfirmation}
          containerStyle={spacings.mb0}
        />
      </View>
      {mismatch && (
        <Alert
          testID="manage-password-mismatch"
          type="error"
          size="sm"
          style={spacings.mbSm}
          text={t(`${PASSWORD}.mismatch`)}
        />
      )}
      <ActionsRow
        primary={
          <Button
            testID="manage-password-keep"
            type="primary"
            text={t(`${PASSWORD}.action`)}
            disabled={!ready}
            onPress={() => onDone(password)}
            hasBottomSpacing={false}
          />
        }
        secondary={
          <Button
            testID="manage-password-cancel"
            type="outline"
            text={t('socialRecovery.actions.cancel')}
            onPress={onCancel}
            hasBottomSpacing={false}
          />
        }
      />
    </SectionCard>
  )
}

export default React.memo(PasswordChange)
