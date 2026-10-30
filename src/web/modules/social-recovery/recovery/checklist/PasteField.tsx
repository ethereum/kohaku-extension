/**
 * A guardian row's paste field: the one line the guardian sent back, and
 * "Add approval". The paste counts or fails at once: an added approval clears
 * the field, and every failure renders its written error with the paste kept
 * for a retry. An approval counts on its signer's row, never on the row it was
 * pasted into; one that lands on another row leaves a line under the field
 * until the next edit. While the check runs a line beside the held button says
 * so.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Input from '@common/components/Input'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import LoadingBlock from '@web/modules/social-recovery/shared/chrome/LoadingBlock'

import { pasteErrorLinesOf } from './paste'
import type { PasteError, PasteFieldProps } from './types'

const GUARDIAN = 'socialRecovery.checklist.guardian'

const PasteField = ({ place, busy, paste, addReply }: PasteFieldProps) => {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<PasteError | null>(null)
  const [elsewhere, setElsewhere] = useState(false)
  const mounted = useRef(true)
  useEffect(
    () => () => {
      mounted.current = false
    },
    []
  )

  const onAdd = useCallback(async () => {
    if (!paste || checking || busy) {
      return
    }
    setChecking(true)
    setError(null)
    setElsewhere(false)
    try {
      const outcome = await paste(text, addReply)
      if (!mounted.current) {
        return
      }
      if (outcome.kind === 'added') {
        setText('')
        setElsewhere(outcome.place !== place)
      } else {
        setError(outcome.error)
      }
    } catch {
      if (mounted.current) {
        setError({ kind: 'checkFailed' })
      }
    } finally {
      if (mounted.current) {
        setChecking(false)
      }
    }
  }, [paste, checking, busy, text, addReply, place])

  const lines = error ? pasteErrorLinesOf(error, t) : []

  return (
    <View style={spacings.mtSm} testID={`checklist-row-${place}-paste`}>
      <Input
        testID={`checklist-row-${place}-paste-input`}
        label={t(`${GUARDIAN}.pasteLabel`)}
        placeholder={t(`${GUARDIAN}.pasteHint`)}
        value={text}
        disabled={checking}
        onChangeText={(next: string) => {
          setText(next)
          setError(null)
          setElsewhere(false)
        }}
      />
      {elsewhere && (
        <Text
          testID={`checklist-row-${place}-paste-elsewhere`}
          fontSize={12}
          appearance="secondaryText"
          style={spacings.mbSm}
        >
          {t(`${GUARDIAN}.pastedElsewhere`)}
        </Text>
      )}
      {lines.length > 0 && (
        <View style={spacings.mbSm} testID={`checklist-row-${place}-paste-error`}>
          {lines.map((line, index) => (
            <Text
              key={line}
              fontSize={index === 0 ? 14 : 12}
              weight={index === 0 ? 'medium' : 'regular'}
              appearance="errorText"
              style={spacings.mbMi}
            >
              {line}
            </Text>
          ))}
        </View>
      )}
      <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap]}>
        <Button
          testID={`checklist-row-${place}-paste-add`}
          type="primary"
          size="small"
          text={t(`${GUARDIAN}.addAction`)}
          disabled={!paste || busy || checking || !text.trim()}
          onPress={() => {
            onAdd().catch(() => undefined)
          }}
          hasBottomSpacing={false}
        />
        {checking && (
          <View testID={`checklist-row-${place}-paste-checking`} style={spacings.mlSm}>
            <LoadingBlock variant="row" message={t('socialRecovery.loading.signature')} />
          </View>
        )}
      </View>
    </View>
  )
}

export default React.memo(PasteField)
