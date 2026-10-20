import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import {
  PathTree,
  PathTreeNode,
  SectionCard,
  SectionLabel
} from '@web/modules/social-recovery/shared/chrome'

import GroupCard from './GroupCard'
import KindMenuButton from './KindMenuButton'
import { ADD_KINDS, SECOND_METHOD_KINDS } from './operations'
import RequiredRow from './RequiredRow'
import type { EditorPathProps } from './types'

/**
 * The path as one tree: the required rows, then the groups, with the line on
 * the left joining them and "and" between each two, since recovery needs every
 * required row and every group's threshold together. The groups' header
 * draws once the path holds a group. The ways to add a required row and a
 * group sit beside the line where they add; the offers to add a second method
 * and to make two required rows one group sit beside the way to add a group.
 */
const EditorPath = ({
  rows,
  groups,
  heldThresholds,
  rowChoosingGroup,
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
  onRemove,
  onThresholdText,
  onMakeRequired,
  onRemoveMember,
  onLowerAndRemove,
  onToggleMenu,
  onRemoveGroup,
  onAddGroup,
  offersSecondMethod,
  canMakeItAGroup,
  onMakeItAGroup,
  stillNeeded
}: EditorPathProps) => {
  const { t } = useTranslation()
  const shared = { addressBook, enrollments, checking, menu, onOpenSlot, onPickKind, onCloseMenu }

  return (
    <PathTree label={t('socialRecovery.shape.and')} testID="editor-path">
      <PathTreeNode key="required" variant="through" testID="editor-required">
        <SectionLabel>{t('socialRecovery.editor.requiredHeader')}</SectionLabel>
        {rows.length === 0 && (
          <SectionCard tone="muted" spacing="item">
            <Text fontSize={14} appearance="secondaryText">
              {t('socialRecovery.editor.nothingRequired')}
            </Text>
          </SectionCard>
        )}
      </PathTreeNode>
      {rows.flatMap((row, position) => [
        ...(position > 0 ? [<PathTreeNode key={`and-${row.index}`} variant="junction" />] : []),
        <PathTreeNode key={`row-${row.index}`} testID={`editor-path-node-${row.index}`}>
          <RequiredRow
            row={row}
            groups={groups}
            choosingGroup={rowChoosingGroup === row.index}
            onMove={onMove}
            onOpenGroupChoice={onOpenGroupChoice}
            onCloseGroupChoice={onCloseGroupChoice}
            onRemove={onRemove}
            {...shared}
          />
        </PathTreeNode>
      ])}
      <PathTreeNode key="add-required" variant="through">
        <View style={groups.length > 0 ? spacings.mbLg : spacings.mbSm}>
          <KindMenuButton
            testID="editor-add-required"
            text={t('socialRecovery.editor.addRequired')}
            open={menu?.place === 'required'}
            kinds={ADD_KINDS}
            onToggle={() => onToggleMenu({ place: 'required' })}
            onPick={onPickKind}
            onClose={onCloseMenu}
            disabled={checking}
          />
        </View>
      </PathTreeNode>
      {rows.length > 0 && groups.length > 0 && <PathTreeNode key="and-groups" variant="junction" />}
      {groups.length > 0 && (
        <PathTreeNode key="groups" variant="through" testID="editor-groups">
          <SectionLabel testID="editor-groups-header">
            {t(
              groups.length === 1
                ? 'socialRecovery.editor.groupHeader'
                : 'socialRecovery.editor.groupsHeader'
            )}
          </SectionLabel>
        </PathTreeNode>
      )}
      {groups.flatMap((group, position) => [
        ...(position > 0 ? [<PathTreeNode key={`and-${group.index}`} variant="junction" />] : []),
        <PathTreeNode key={`group-${group.index}`} testID={`editor-path-node-${group.index}`}>
          <GroupCard
            group={group}
            ordinal={position + 1}
            heldText={heldThresholds[group.index]}
            onThresholdText={onThresholdText}
            onMakeRequired={onMakeRequired}
            onRemoveMember={onRemoveMember}
            onLowerAndRemove={onLowerAndRemove}
            onToggleMenu={onToggleMenu}
            onRemoveGroup={onRemoveGroup}
            stillNeeded={stillNeeded}
            {...shared}
          />
        </PathTreeNode>
      ])}
      <PathTreeNode key="add-group" variant="through">
        <View style={[flexbox.directionRow, flexbox.wrap, spacings.mbLg]}>
          <Button
            testID="editor-add-group"
            type="secondary"
            size="small"
            text={t('socialRecovery.editor.addGroup')}
            onPress={onAddGroup}
            disabled={checking}
            hasBottomSpacing={false}
            style={[flexbox.alignSelfStart, spacings.mrTy]}
          />
          {canMakeItAGroup && (
            <Button
              testID="editor-make-it-a-group"
              type="secondary"
              size="small"
              text={t('socialRecovery.editor.makeItAGroup')}
              onPress={onMakeItAGroup}
              disabled={checking}
              hasBottomSpacing={false}
              style={[flexbox.alignSelfStart, spacings.mrTy]}
            />
          )}
          {offersSecondMethod && (
            <KindMenuButton
              testID="editor-add-second-method"
              text={t('socialRecovery.editor.addSecondMethod')}
              open={menu?.place === 'second'}
              kinds={SECOND_METHOD_KINDS}
              onToggle={() => onToggleMenu({ place: 'second' })}
              onPick={onPickKind}
              onClose={onCloseMenu}
              disabled={checking}
            />
          )}
        </View>
      </PathTreeNode>
    </PathTree>
  )
}

export default React.memo(EditorPath)
