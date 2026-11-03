/**
 * The recovery password ask of a path this device cannot read: the locked
 * notice with its action, then the field and the unlock, the check running,
 * the wrong password's line over the field, and the failed read of the setup
 * event with its retry, which never says the password worked. The field's
 * value lives in this component alone and is emptied once a check starts.
 */
import React, { useCallback, useState } from 'react'
import { View } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'

import { LOCKED } from './constants'
import PathLockedBody from './PathLockedBody'
import type { PathLockedAskProps } from './types'

const PathLockedAsk = ({
  ask,
  onUnlock,
  onAskAgain,
  onRetry,
  bare,
  testID
}: PathLockedAskProps) => {
  const { t } = useTranslation()
  const [typed, setTyped] = useState('')
  const [asking, setAsking] = useState(!!bare)

  const change = useCallback(
    (text: string) => {
      setTyped(text)
      if (ask.status === 'wrong') {
        onAskAgain()
      }
    },
    [ask.status, onAskAgain]
  )

  const submit = useCallback(() => {
    if (!typed || ask.status !== 'idle') {
      return
    }
    onUnlock(typed)
    setTyped('')
  }, [typed, ask.status, onUnlock])

  const openField = useCallback(() => setAsking(true), [])

  return (
    <View testID={testID}>
      {!bare && (
        <>
          <Text fontSize={16} weight="medium" style={spacings.mbTy} testID={`${testID}-title`}>
            {t(`${LOCKED}.title`)}
          </Text>
          <Text fontSize={14} style={spacings.mbSm} testID={`${testID}-body`}>
            {t(`${LOCKED}.body`)}
          </Text>
        </>
      )}
      <PathLockedBody
        ask={ask}
        asking={asking}
        onAsk={openField}
        typed={typed}
        onChange={change}
        onSubmit={submit}
        onRetry={onRetry}
        testID={testID}
      />
    </View>
  )
}

export default React.memo(PathLockedAsk)
