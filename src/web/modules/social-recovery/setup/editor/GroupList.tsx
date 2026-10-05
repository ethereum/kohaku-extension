import React from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { MethodRow, SectionCard, SectionLabel } from '@web/modules/social-recovery/shared/chrome'

import { renderHeldThreshold } from './copy'
import CredentialRow from './CredentialRow'
import ThresholdField from './ThresholdField'
import type { GroupListProps } from './types'

/**
 * The groups, each with its threshold field and the line refusing text that
 * is not a whole number, its members and their actions, and the way to add a
 * group.
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
      <SectionLabel testID="editor-groups-header">
        {t(
          groups.length === 1
            ? 'socialRecovery.editor.groupHeader'
            : 'socialRecovery.editor.groupsHeader'
        )}
      </SectionLabel>
      {groups.length === 0 && (
        <SectionCard tone="muted" spacing="item">
          <Text fontSize={14} appearance="secondaryText">
            {t('socialRecovery.editor.noGroup')}
          </Text>
        </SectionCard>
      )}
      {groups.map(({ clause, index }, ordinal) => (
        <SectionCard key={index} spacing="item" testID={`editor-group-${index}`}>
          <View
            style={[
              flexbox.directionRow,
              flexbox.alignCenter,
              flexbox.justifySpaceBetween,
              flexbox.wrap,
              spacings.mbSm
            ]}
          >
            <Text fontSize={16} weight="medium" style={spacings.mrSm}>
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
          </View>
          {heldThresholds[index] !== undefined && (
            <Alert
              type="error"
              size="sm"
              style={spacings.mbSm}
              text={
                <Alert.Text
                  size="sm"
                  type="error"
                  testID={`editor-group-${index}-threshold-refusal`}
                >
                  {renderHeldThreshold(t)}
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
              <CredentialRow
                credential={credential}
                addressBook={addressBook}
                enrollments={enrollments}
                onPress={() => onOpenSlot(index, member)}
                disabled={checking}
                testID={`editor-slot-${index}-${member}`}
              />
              <View
                style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap, spacings.mtTy]}
              >
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
                <Button
                  testID={`editor-member-${index}-${member}-remove`}
                  type="secondary"
                  size="small"
                  text={t('socialRecovery.actions.remove')}
                  onPress={() => onRemoveMember(index, member)}
                  disabled={checking}
                  hasBottomSpacing={false}
                />
              </View>
            </MethodRow>
          ))}
          <View style={[flexbox.directionRow, flexbox.wrap, spacings.mtTy]}>
            <Button
              testID={`editor-group-${index}-add`}
              type="secondary"
              size="small"
              text={t('socialRecovery.editor.addMember')}
              onPress={() => onAddMember(index)}
              disabled={checking}
              hasBottomSpacing={false}
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
      ))}
      <Button
        testID="editor-add-group"
        type="secondary"
        size="small"
        text={t('socialRecovery.editor.addGroup')}
        onPress={onAddGroup}
        disabled={checking}
        hasBottomSpacing={false}
        style={[flexbox.alignSelfStart, spacings.mtTy]}
      />
    </View>
  )
}

export default React.memo(GroupList)
