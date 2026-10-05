import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { MethodRow, SectionCard, SectionLabel } from '@web/modules/social-recovery/shared/chrome'

import CredentialRow from './CredentialRow'
import type { RequiredRowsProps } from './types'

/**
 * The required rows, each with its way into a group and its remove, and the
 * way to add a required row.
 */
const RequiredRows = ({
  rows,
  groups,
  rowChoosingGroup,
  addressBook,
  enrollments,
  checking,
  onOpenSlot,
  onMove,
  onOpenGroupChoice,
  onCloseGroupChoice,
  onRemove,
  onAdd
}: RequiredRowsProps) => {
  const { t } = useTranslation()

  return (
    <View style={spacings.mbLg} testID="editor-required">
      <SectionLabel>{t('socialRecovery.editor.requiredHeader')}</SectionLabel>
      {rows.length === 0 && (
        <SectionCard tone="muted" spacing="item">
          <Text fontSize={14} appearance="secondaryText">
            {t('socialRecovery.editor.nothingRequired')}
          </Text>
        </SectionCard>
      )}
      {rows.map(({ clause, index }) => (
        <MethodRow key={index} testID={`editor-row-${index}`}>
          <CredentialRow
            credential={clause.credentials[0]}
            addressBook={addressBook}
            enrollments={enrollments}
            onPress={() => onOpenSlot(index, 0)}
            disabled={checking}
            testID={`editor-slot-${index}-0`}
          />
          <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap, spacings.mtTy]}>
            {groups.length > 0 && (
              <Button
                testID={`editor-row-${index}-move`}
                type="secondary"
                size="small"
                text={t('socialRecovery.editor.moveToGroup')}
                onPress={() =>
                  groups.length === 1 ? onMove(index, groups[0].index) : onOpenGroupChoice(index)
                }
                disabled={checking}
                hasBottomSpacing={false}
                style={spacings.mrTy}
              />
            )}
            <Button
              testID={`editor-row-${index}-remove`}
              type="secondary"
              size="small"
              text={t('socialRecovery.actions.remove')}
              onPress={() => onRemove(index)}
              disabled={checking}
              hasBottomSpacing={false}
            />
          </View>
          {rowChoosingGroup === index && (
            <View style={[flexbox.directionRow, flexbox.wrap, spacings.mtTy]}>
              {groups.map((group, ordinal) => (
                <Button
                  key={group.index}
                  testID={`editor-row-${index}-move-${group.index}`}
                  type="secondary"
                  size="small"
                  text={t('socialRecovery.shape.group', { n: ordinal + 1 })}
                  onPress={() => onMove(index, group.index)}
                  disabled={checking}
                  hasBottomSpacing={false}
                  style={spacings.mrTy}
                />
              ))}
              <Button
                testID={`editor-row-${index}-move-cancel`}
                type="secondary"
                size="small"
                text={t('socialRecovery.ceremony.cancelAction')}
                onPress={onCloseGroupChoice}
                disabled={checking}
                hasBottomSpacing={false}
              />
            </View>
          )}
        </MethodRow>
      ))}
      <Button
        testID="editor-add-required"
        type="secondary"
        size="small"
        text={t('socialRecovery.editor.addRequired')}
        onPress={onAdd}
        disabled={checking}
        hasBottomSpacing={false}
        style={[flexbox.alignSelfStart, spacings.mtTy]}
      />
    </View>
  )
}

export default React.memo(RequiredRows)
