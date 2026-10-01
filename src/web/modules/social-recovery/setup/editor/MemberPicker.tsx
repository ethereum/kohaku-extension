import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

import { renderKindHeader } from './copy'
import CredentialRow from './CredentialRow'
import type { MemberPickerProps } from './types'

/**
 * "Add to your path": the enrolled credentials by kind, each one the path
 * already holds marked so, and for each kind the way to a new one: a new
 * address for a guardian, a new enrollment for the others.
 */
const MemberPicker = ({
  entries,
  kinds,
  addressBook,
  onPick,
  onEnrollNew,
  onClose,
  disabled
}: MemberPickerProps) => {
  const { t } = useTranslation()
  const enrollments = kinds.flatMap((kind) => entries[kind].map((entry) => entry.enrollment))

  return (
    <View testID="editor-picker" style={spacings.mbLg}>
      <Text fontSize={18} weight="semiBold" style={spacings.mbTy}>
        {t('socialRecovery.editor.picker.title')}
      </Text>
      <Text fontSize={14} appearance="secondaryText" style={spacings.mbMd}>
        {t('socialRecovery.editor.picker.lead')}
      </Text>
      {kinds.map((kind) => (
        <View key={kind} testID={`editor-picker-${kind}`} style={spacings.mbMd}>
          <Text fontSize={14} weight="semiBold" style={spacings.mbTy}>
            {renderKindHeader(kind, t)}
          </Text>
          {entries[kind].map(({ enrollment, inPath }, index) => (
            <View
              key={`${enrollment.credential.method}:${enrollment.credential.config}`}
              style={[flexbox.directionRow, flexbox.alignCenter, spacings.mbTy]}
            >
              <CredentialRow
                credential={enrollment.credential}
                addressBook={addressBook}
                enrollments={enrollments}
              />
              {inPath && (
                <Text fontSize={12} appearance="secondaryText" style={spacings.mrTy}>
                  {t('socialRecovery.editor.picker.alreadyInPath')}
                </Text>
              )}
              <Button
                testID={`editor-picker-${kind}-${index}`}
                type="outline"
                size="small"
                text={t('socialRecovery.actions.add')}
                onPress={() => onPick(enrollment.credential)}
                disabled={disabled}
                hasBottomSpacing={false}
              />
            </View>
          ))}
          <Button
            testID={`editor-picker-${kind}-new`}
            type="outline"
            size="small"
            text={
              kind === 'ecdsa'
                ? t('socialRecovery.editor.picker.newAddress')
                : t('socialRecovery.editor.picker.enrollNew')
            }
            onPress={() => onEnrollNew(kind)}
            disabled={disabled}
            hasBottomSpacing={false}
          />
        </View>
      ))}
      <Text fontSize={12} appearance="secondaryText" style={spacings.mbSm}>
        {t('socialRecovery.editor.picker.pickToContinue')}
      </Text>
      <Button
        testID="editor-picker-close"
        type="outline"
        size="small"
        text={t('socialRecovery.ceremony.cancelAction')}
        onPress={onClose}
        hasBottomSpacing={false}
      />
    </View>
  )
}

export default React.memo(MemberPicker)
