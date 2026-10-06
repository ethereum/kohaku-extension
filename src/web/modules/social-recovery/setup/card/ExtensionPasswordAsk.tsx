/**
 * Asks the extension password before a new download, print or hand-off of the card. The keystore
 * checks it with the same unlock the wallet runs; a wrong password says so and
 * the card stays where it is.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import InputPassword from '@common/components/InputPassword'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'
import { ActionsRow } from '@web/modules/social-recovery/shared/chrome'
import { renderPasswordName } from '@web/modules/social-recovery/shared/display'

import type { PasswordAskAnswer } from './types'

const ExtensionPasswordAsk = ({ onConfirmed, onCancel }: PasswordAskAnswer) => {
  const { t } = useTranslation()
  const { dispatch } = useBackgroundService()
  const { statuses, errorMessage } = useKeystoreControllerState()
  const [password, setPassword] = useState('')
  const [failed, setFailed] = useState(false)
  // Only an unlock this ask sent confirms it or fails it.
  const sent = useRef(false)
  // Whether the unlock this ask sent has left the initial state yet.
  const started = useRef(false)

  // The ask opens clean, whatever an earlier unlock left behind.
  useEffect(() => {
    dispatch({ type: 'KEYSTORE_CONTROLLER_RESET_ERROR_STATE' })
  }, [dispatch])

  useEffect(() => {
    if (!sent.current) {
      return
    }
    if (errorMessage) {
      sent.current = false
      setFailed(true)
    } else if (statuses.unlockWithSecret === 'SUCCESS') {
      sent.current = false
      onConfirmed()
    } else if (statuses.unlockWithSecret !== 'INITIAL') {
      started.current = true
    } else if (started.current) {
      // The unlock ended with neither a success nor an error: a later submit may send again.
      sent.current = false
    }
  }, [errorMessage, statuses.unlockWithSecret, onConfirmed])

  const busy = statuses.unlockWithSecret !== 'INITIAL'

  const submit = useCallback(() => {
    if (!password || busy || sent.current) {
      return
    }
    sent.current = true
    started.current = false
    dispatch({
      type: 'KEYSTORE_CONTROLLER_UNLOCK_WITH_SECRET',
      params: { secretId: 'password', secret: password }
    })
  }, [dispatch, password, busy])

  const change = useCallback(
    (value: string) => {
      setPassword(value)
      setFailed(false)
      if (errorMessage) {
        dispatch({ type: 'KEYSTORE_CONTROLLER_RESET_ERROR_STATE' })
      }
    },
    [dispatch, errorMessage]
  )

  const cancel = useCallback(() => {
    sent.current = false
    dispatch({ type: 'KEYSTORE_CONTROLLER_RESET_ERROR_STATE' })
    onCancel()
  }, [dispatch, onCancel])

  return (
    <View>
      <Text fontSize={14} style={spacings.mbSm}>
        {t('socialRecovery.card.carrierAsks')}
      </Text>
      <InputPassword
        testID="card-extension-password"
        label={renderPasswordName('extensionPassword', t)}
        value={password}
        onChangeText={change}
        onSubmitEditing={submit}
        error={failed ? t('socialRecovery.card.wrongPassword') : undefined}
      />
      <ActionsRow
        primary={
          <Button
            testID="card-password-confirm"
            type="primary"
            hasBottomSpacing={false}
            text={t('socialRecovery.actions.continue')}
            disabled={!password || busy}
            onPress={submit}
          />
        }
        secondary={
          <Button
            testID="card-password-cancel"
            type="outline"
            hasBottomSpacing={false}
            text={t('socialRecovery.ceremony.backAction')}
            onPress={cancel}
          />
        }
      />
    </View>
  )
}

export default React.memo(ExtensionPasswordAsk)
