import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

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
      <Text fontSize={16} weight="semiBold" style={spacings.mbSm}>
        {t('socialRecovery.editor.requiredHeader')}
      </Text>
      {rows.length === 0 && (
        <Text fontSize={14} appearance="secondaryText" style={spacings.mbSm}>
          {t('socialRecovery.editor.nothingRequired')}
        </Text>
      )}
      {rows.map(({ clause, index }) => (
        <View key={index} style={spacings.mbSm} testID={`editor-row-${index}`}>
          <View style={[flexbox.directionRow, flexbox.alignCenter]}>
            <CredentialRow
              credential={clause.credentials[0]}
              addressBook={addressBook}
              enrollments={enrollments}
              onPress={() => onOpenSlot(index, 0)}
              disabled={checking}
              testID={`editor-slot-${index}-0`}
            />
            {groups.length > 0 && (
              <Button
                testID={`editor-row-${index}-move`}
                type="outline"
                size="small"
                text={t('socialRecovery.editor.moveToGroup')}
                onPress={() =>
                  groups.length === 1 ? onMove(index, groups[0].index) : onOpenGroupChoice(index)
                }
                disabled={checking}
                hasBottomSpacing={false}
              />
            )}
            <Button
              testID={`editor-row-${index}-remove`}
              type="outline"
              size="small"
              text={t('socialRecovery.actions.remove')}
              onPress={() => onRemove(index)}
              disabled={checking}
              hasBottomSpacing={false}
            />
          </View>
          {rowChoosingGroup === index && (
            <View style={[flexbox.directionRow, flexbox.wrap]}>
              {groups.map((group, ordinal) => (
                <Button
                  key={group.index}
                  testID={`editor-row-${index}-move-${group.index}`}
                  type="outline"
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
                type="outline"
                size="small"
                text={t('socialRecovery.ceremony.cancelAction')}
                onPress={onCloseGroupChoice}
                disabled={checking}
                hasBottomSpacing={false}
              />
            </View>
          )}
        </View>
      ))}
      <Button
        testID="editor-add-required"
        type="outline"
        size="small"
        text={t('socialRecovery.editor.addRequired')}
        onPress={onAdd}
        disabled={checking}
        hasBottomSpacing={false}
      />
    </View>
  )
}

export default React.memo(RequiredRows)
