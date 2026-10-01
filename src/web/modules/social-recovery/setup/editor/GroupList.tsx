import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

import CredentialRow from './CredentialRow'
import ThresholdField from './ThresholdField'
import type { GroupListProps } from './types'

/**
 * The groups, each with its threshold field, its members and their actions,
 * and the way to add a group.
 */
const GroupList = ({
  groups,
  heldThresholds,
  addressBook,
  enrollments,
  checking,
  onOpenSlot,
  onThresholdText,
  onMakeRequired,
  onRemoveMember,
  onAddMember,
  onRemoveGroup,
  onAddGroup
}: GroupListProps) => {
  const { t } = useTranslation()

  return (
    <View style={spacings.mbLg} testID="editor-groups">
      <Text fontSize={16} weight="semiBold" style={spacings.mbSm} testID="editor-groups-header">
        {t(
          groups.length === 1
            ? 'socialRecovery.editor.groupHeader'
            : 'socialRecovery.editor.groupsHeader'
        )}
      </Text>
      {groups.length === 0 && (
        <Text fontSize={14} appearance="secondaryText" style={spacings.mbSm}>
          {t('socialRecovery.editor.noGroup')}
        </Text>
      )}
      {groups.map(({ clause, index }, ordinal) => (
        <View key={index} style={spacings.mbMd} testID={`editor-group-${index}`}>
          <Text fontSize={14} weight="semiBold" style={spacings.mbTy}>
            {t('socialRecovery.shape.group', { n: ordinal + 1 })}
          </Text>
          <ThresholdField
            testID={`editor-group-${index}-threshold`}
            threshold={clause.threshold}
            heldText={heldThresholds[index]}
            members={clause.credentials.length}
            disabled={checking}
            onChangeText={(text) => onThresholdText(index, text)}
          />
          {clause.credentials.map((credential, member) => (
            <View
              // A member's place in its group is its identity in the path.
              // eslint-disable-next-line react/no-array-index-key
              key={member}
              style={[flexbox.directionRow, flexbox.alignCenter, spacings.mtTy]}
            >
              <CredentialRow
                credential={credential}
                addressBook={addressBook}
                enrollments={enrollments}
                onPress={() => onOpenSlot(index, member)}
                disabled={checking}
                testID={`editor-slot-${index}-${member}`}
              />
              <Button
                testID={`editor-member-${index}-${member}-required`}
                type="outline"
                size="small"
                text={t('socialRecovery.editor.makeRequired')}
                onPress={() => onMakeRequired(index, member)}
                disabled={checking}
                hasBottomSpacing={false}
              />
              <Button
                testID={`editor-member-${index}-${member}-remove`}
                type="outline"
                size="small"
                text={t('socialRecovery.actions.remove')}
                onPress={() => onRemoveMember(index, member)}
                disabled={checking}
                hasBottomSpacing={false}
              />
            </View>
          ))}
          <View style={[flexbox.directionRow, spacings.mtSm]}>
            <Button
              testID={`editor-group-${index}-add`}
              type="outline"
              size="small"
              text={t('socialRecovery.editor.addMember')}
              onPress={() => onAddMember(index)}
              disabled={checking}
              hasBottomSpacing={false}
              style={spacings.mrTy}
            />
            <Button
              testID={`editor-group-${index}-remove`}
              type="outline"
              size="small"
              text={t('socialRecovery.editor.removeGroup')}
              onPress={() => onRemoveGroup(index)}
              disabled={checking}
              hasBottomSpacing={false}
            />
          </View>
        </View>
      ))}
      <Button
        testID="editor-add-group"
        type="outline"
        size="small"
        text={t('socialRecovery.editor.addGroup')}
        onPress={onAddGroup}
        disabled={checking}
        hasBottomSpacing={false}
      />
    </View>
  )
}

export default React.memo(GroupList)
