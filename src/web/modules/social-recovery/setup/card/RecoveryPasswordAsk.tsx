/**
 * Asks the recovery password again when it is not in memory, in the card's
 * password row. One check runs at a time. A wrong password empties the field;
 * a check that could not run keeps it, so the button tries again. A new check
 * clears the earlier line. The field's value lives in this component alone and
 * goes with it once the password opens.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import InputPassword from '@common/components/InputPassword'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { renderPasswordName } from '@web/modules/social-recovery/shared/display'

import type {
  RecoveryPasswordAskLine,
  RecoveryPasswordAskProps,
  RecoveryPasswordCheck
} from './types'

const RecoveryPasswordAsk = ({ check }: RecoveryPasswordAskProps) => {
  const { t } = useTranslation()
  const [typed, setTyped] = useState('')
  const [checking, setChecking] = useState(false)
  const [line, setLine] = useState<RecoveryPasswordAskLine | null>(null)
  // A second press before the render that disables the button checks nothing.
  const busy = useRef(false)
  const live = useRef(true)

  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  const submit = useCallback(() => {
    if (!typed || busy.current) {
      return
    }
    busy.current = true
    setChecking(true)
    setLine(null)
    const settle = (result: RecoveryPasswordCheck) => {
      if (!live.current) {
        return
      }
      busy.current = false
      setChecking(false)
      if (result === 'opened') {
        setTyped('')
      } else if (result === 'wrong') {
        setTyped('')
        setLine('wrong')
      } else if (result === 'unchecked') {
        setLine('unchecked')
      }
    }
    check(typed).then(settle, () => settle('unchecked'))
  }, [typed, check])

  return (
    <View testID="card-recovery-password-ask">
      <Text
        testID="card-recovery-password-lead"
        fontSize={14}
        appearance="secondaryText"
        style={spacings.mbSm}
      >
        {t('socialRecovery.card.passwordAsk')}
      </Text>
      <InputPassword
        testID="card-recovery-password-field"
        accessibilityLabel={renderPasswordName('recoveryPassword', t)}
        value={typed}
        onChangeText={setTyped}
        onSubmitEditing={submit}
        containerStyle={spacings.mb0}
      />
      {line === 'wrong' && (
        <Text
          testID="card-recovery-password-wrong"
          fontSize={12}
          appearance="errorText"
          style={spacings.mtTy}
        >
          {t('socialRecovery.card.wrongRecoveryPassword')}
        </Text>
      )}
      {line === 'unchecked' && (
        <Text
          testID="card-recovery-password-unchecked"
          fontSize={12}
          appearance="warningText"
          style={spacings.mtTy}
        >
          {t('socialRecovery.card.passwordUnchecked')}
        </Text>
      )}
      <Button
        testID="card-recovery-password-check"
        type="primary"
        size="small"
        hasBottomSpacing={false}
        text={t('socialRecovery.card.passwordAskAction')}
        disabled={!typed || checking}
        onPress={submit}
        style={[flexbox.alignSelfStart, spacings.mtSm]}
      />
    </View>
  )
}

export default React.memo(RecoveryPasswordAsk)
