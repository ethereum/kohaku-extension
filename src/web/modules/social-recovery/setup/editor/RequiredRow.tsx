import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { MethodRow } from '@web/modules/social-recovery/shared/chrome'

import SlotRow from './SlotRow'
import type { RequiredRowProps } from './types'

/** One required row, with its way into a group and its remove. */
const RequiredRow = ({
  row: { clause, index },
  groups,
  choosingGroup,
  addressBook,
  enrollments,
  checking,
  menu,
  onOpenSlot,
  onPickKind,
  onCloseMenu,
  onMove,
  onOpenGroupChoice,
  onCloseGroupChoice,
  onRemove
}: RequiredRowProps) => {
  const { t } = useTranslation()

  return (
    <MethodRow testID={`editor-row-${index}`}>
      <SlotRow
        clause={index}
        member={0}
        credential={clause.credentials[0]}
        addressBook={addressBook}
        enrollments={enrollments}
        checking={checking}
        menu={menu}
        onOpenSlot={onOpenSlot}
        onPickKind={onPickKind}
        onCloseMenu={onCloseMenu}
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
      {choosingGroup && (
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
  )
}

export default React.memo(RequiredRow)
