import React from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import {
  MethodRow,
  PathTreeHeader,
  SectionCard,
  StatusChip
} from '@web/modules/social-recovery/shared/chrome'
import { renderChip } from '@web/modules/social-recovery/shared/display'

import { renderHeldThreshold, renderRefusal } from './copy'
import KindMenuButton from './KindMenuButton'
import { ADD_KINDS, isEmptySlot } from './operations'
import SlotRow from './SlotRow'
import ThresholdField from './ThresholdField'
import type { GroupCardProps } from './types'

/**
 * One group: its threshold field and the line refusing text that is not a
 * whole number or a threshold above the group's members (as soon as the group
 * holds one, before Continue), its members and their actions, the menu that
 * adds a member of any kind, and its remove. A member the path cannot lose
 * reads still needed with the reason under it, and in place of its remove one
 * action lowers the group's threshold by one and removes it.
 */
const GroupCard = ({
  group: { clause, index },
  ordinal,
  heldText,
  addressBook,
  enrollments,
  checking,
  menu,
  onOpenSlot,
  onPickKind,
  onCloseMenu,
  onThresholdText,
  onMakeRequired,
  onRemoveMember,
  onLowerAndRemove,
  onToggleMenu,
  onRemoveGroup,
  stillNeeded
}: GroupCardProps) => {
  const { t } = useTranslation()
  const members = clause.credentials.length
  const aboveMembers = heldText === undefined && members > 0 && clause.threshold > members
  const filled = clause.credentials.filter((credential) => !isEmptySlot(credential)).length
  const neededAt = (member: number) => !!stillNeeded?.has(`${index}:${member}`)

  return (
    <SectionCard spacing="item" testID={`editor-group-${index}`}>
      <PathTreeHeader
        style={[
          flexbox.directionRow,
          flexbox.alignCenter,
          flexbox.justifySpaceBetween,
          flexbox.wrap,
          spacings.mbSm
        ]}
      >
        <Text fontSize={16} weight="medium" style={spacings.mrSm}>
          {t('socialRecovery.shape.group', { n: ordinal })}
        </Text>
        <ThresholdField
          testID={`editor-group-${index}-threshold`}
          threshold={clause.threshold}
          heldText={heldText}
          members={members}
          disabled={checking}
          onChangeText={(text) => onThresholdText(index, text)}
        />
      </PathTreeHeader>
      {heldText !== undefined && (
        <Alert
          type="error"
          size="sm"
          style={spacings.mbSm}
          text={
            <Alert.Text size="sm" type="error" testID={`editor-group-${index}-threshold-refusal`}>
              {renderHeldThreshold(t)}
            </Alert.Text>
          }
        />
      )}
      {aboveMembers && (
        <Alert
          type="error"
          size="sm"
          style={spacings.mbSm}
          text={
            <Alert.Text size="sm" type="error" testID={`editor-group-${index}-above-members`}>
              {renderRefusal({ key: 'thresholdAboveMembers', clause: index }, t)}
            </Alert.Text>
          }
        />
      )}
      {clause.credentials.map((credential, member) => (
        <MethodRow
          // A member's place in its group is its identity in the path.
          // eslint-disable-next-line react/no-array-index-key
          key={member}
        >
          <SlotRow
            clause={index}
            member={member}
            credential={credential}
            addressBook={addressBook}
            enrollments={enrollments}
            checking={checking}
            menu={menu}
            onOpenSlot={onOpenSlot}
            onPickKind={onPickKind}
            onCloseMenu={onCloseMenu}
          />
          <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap, spacings.mtTy]}>
            <Button
              testID={`editor-member-${index}-${member}-required`}
              type="secondary"
              size="small"
              text={t('socialRecovery.editor.makeRequired')}
              onPress={() => onMakeRequired(index, member)}
              disabled={checking}
              hasBottomSpacing={false}
              style={spacings.mrTy}
            />
            {neededAt(member) ? (
              <Button
                testID={`editor-member-${index}-${member}-lower-and-remove`}
                type="secondary"
                size="small"
                text={t('socialRecovery.management.editor.stillNeeded.action')}
                onPress={() => onLowerAndRemove(index, member)}
                disabled={checking}
                hasBottomSpacing={false}
                style={spacings.mrTy}
              />
            ) : (
              <Button
                testID={`editor-member-${index}-${member}-remove`}
                type="secondary"
                size="small"
                text={t('socialRecovery.actions.remove')}
                onPress={() => onRemoveMember(index, member)}
                disabled={checking}
                hasBottomSpacing={false}
                style={spacings.mrTy}
              />
            )}
            {neededAt(member) && (
              <StatusChip
                text={renderChip('editor', 'stillNeeded', t)}
                tone="warning"
                testID={`editor-member-${index}-${member}-still-needed`}
              />
            )}
          </View>
          {neededAt(member) && (
            <Text
              fontSize={12}
              appearance="secondaryText"
              style={spacings.mtTy}
              testID={`editor-member-${index}-${member}-still-needed-reason`}
            >
              {t('socialRecovery.management.editor.stillNeeded.body', {
                required: clause.threshold,
                count: filled
              })}
            </Text>
          )}
        </MethodRow>
      ))}
      <View style={[flexbox.directionRow, flexbox.wrap, flexbox.alignStart, spacings.mtTy]}>
        <KindMenuButton
          testID={`editor-group-${index}-add`}
          text={t('socialRecovery.editor.addMember')}
          open={menu?.place === 'member' && menu.clause === index}
          kinds={ADD_KINDS}
          addressBook={addressBook}
          onToggle={() => onToggleMenu({ place: 'member', clause: index })}
          onPick={onPickKind}
          onClose={onCloseMenu}
          disabled={checking}
          style={spacings.mrTy}
        />
        <Button
          testID={`editor-group-${index}-remove`}
          type="secondary"
          size="small"
          text={t('socialRecovery.editor.removeGroup')}
          onPress={() => onRemoveGroup(index)}
          disabled={checking}
          hasBottomSpacing={false}
        />
      </View>
    </SectionCard>
  )
}

export default React.memo(GroupCard)
