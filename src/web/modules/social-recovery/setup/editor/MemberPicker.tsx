import React from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import {
  ActionsRow,
  MethodRow,
  SectionCard,
  SectionLabel
} from '@web/modules/social-recovery/shared/chrome'

import { renderKindHeader } from './copy'
import CredentialRow from './CredentialRow'
import type { MemberPickerProps } from './types'

/**
 * "Add to your path": the enrolled credentials by kind, each one the path
 * already holds marked so, and for each kind the way to a new one: a new
 * address for a guardian, a new enrollment for the others. A pick the path
 * already holds leaves its refusal under the entries, beside the press.
 */
const MemberPicker = ({
  entries,
  kinds,
  addressBook,
  onPick,
  onEnrollNew,
  onClose,
  disabled,
  refused
}: MemberPickerProps) => {
  const { t } = useTranslation()
  const enrollments = kinds.flatMap((kind) => entries[kind].map((entry) => entry.enrollment))

  return (
    <SectionCard testID="editor-picker">
      <Text fontSize={16} weight="medium" style={spacings.mbTy}>
        {t('socialRecovery.editor.picker.title')}
      </Text>
      <Text fontSize={14} appearance="secondaryText" style={spacings.mbMd}>
        {t('socialRecovery.editor.picker.lead')}
      </Text>
      {kinds.map((kind) => (
        <View key={kind} testID={`editor-picker-${kind}`} style={spacings.mbMd}>
          <SectionLabel>{renderKindHeader(kind, t)}</SectionLabel>
          {entries[kind].map(({ enrollment, inPath }, index) => (
            <MethodRow
              key={`${enrollment.credential.method}:${enrollment.credential.config}`}
              style={[flexbox.directionRow, flexbox.alignCenter]}
            >
              <View style={flexbox.flex1}>
                <CredentialRow
                  credential={enrollment.credential}
                  addressBook={addressBook}
                  enrollments={enrollments}
                />
                {inPath && (
                  <Text fontSize={12} appearance="secondaryText" style={spacings.mtMi}>
                    {t('socialRecovery.editor.picker.alreadyInPath')}
                  </Text>
                )}
              </View>
              <Button
                testID={`editor-picker-${kind}-${index}`}
                type="secondary"
                size="small"
                text={t('socialRecovery.actions.add')}
                onPress={() => onPick(enrollment.credential)}
                disabled={disabled}
                hasBottomSpacing={false}
                style={spacings.mlSm}
              />
            </MethodRow>
          ))}
          <Button
            testID={`editor-picker-${kind}-new`}
            type="secondary"
            size="small"
            text={
              kind === 'ecdsa'
                ? t('socialRecovery.editor.picker.newAddress')
                : t('socialRecovery.editor.picker.enrollNew')
            }
            onPress={() => onEnrollNew(kind)}
            disabled={disabled}
            hasBottomSpacing={false}
            style={[flexbox.alignSelfStart, spacings.mtTy]}
          />
        </View>
      ))}
      {refused && (
        <Alert
          type="error"
          size="sm"
          text={
            <Alert.Text size="sm" type="error" testID="editor-refusal">
              {t('socialRecovery.editor.duplicate')}
            </Alert.Text>
          }
        />
      )}
      <ActionsRow
        primary={
          <Button
            testID="editor-picker-close"
            type="secondary"
            size="small"
            text={t('socialRecovery.ceremony.cancelAction')}
            onPress={onClose}
            hasBottomSpacing={false}
          />
        }
        note={t('socialRecovery.editor.picker.pickToContinue')}
      />
    </SectionCard>
  )
}

export default React.memo(MemberPicker)
