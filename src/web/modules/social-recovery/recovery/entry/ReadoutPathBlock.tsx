/**
 * The path as the readout draws it: the required rows, then each group under
 * its header with its threshold, three members and a count of the rest until
 * the holder shows them all, then the rule lines and the waiting period. A
 * masked value reads as the hidden value beside its chip.
 */
import React, { useState } from 'react'
import { Pressable, View } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { MethodRow, SectionLabel, StatusChip } from '@web/modules/social-recovery/shared/chrome'
import { renderMemberList } from '@web/modules/social-recovery/shared/display'

import type { ReadoutPathBlockProps, ReadoutRow } from './types'

const ReadoutPathBlock = ({ path }: ReadoutPathBlockProps) => {
  const { t } = useTranslation()
  const [shownAll, setShownAll] = useState<number[]>([])

  const renderRow = (row: ReadoutRow, clause: number, member: number) => {
    const testID = `readout-row-${clause}-${member}`
    return (
      <MethodRow key={testID} testID={testID}>
        <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
          <View style={[flexbox.flex1, flexbox.directionRow, flexbox.alignCenter, flexbox.wrap]}>
            <Text
              fontSize={14}
              weight={row.chip ? 'regular' : 'medium'}
              style={spacings.mrTy}
              testID={`${testID}-name`}
            >
              {row.name}
            </Text>
            {!!row.aside && (
              <Text
                fontSize={14}
                appearance="secondaryText"
                style={spacings.mrTy}
                testID={`${testID}-aside`}
              >
                {row.aside}
              </Text>
            )}
          </View>
          {!!row.chip && (
            <StatusChip text={row.chip} testID={`${testID}-chip`} style={spacings.mlTy} />
          )}
        </View>
        {row.lines.map((line, index) => (
          <Text
            // The lines of one row are fixed in number and order.
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            fontSize={12}
            appearance="secondaryText"
            style={spacings.mtMi}
            testID={`${testID}-line-${index}`}
          >
            {line}
          </Text>
        ))}
      </MethodRow>
    )
  }

  const hasRequired = path.clauses.some(({ required }) => required)
  let groupNumber = 0

  return (
    <View testID="readout-path">
      <SectionLabel>{t('socialRecovery.review.pathHeader')}</SectionLabel>
      {hasRequired && <SectionLabel>{t('socialRecovery.editor.requiredHeader')}</SectionLabel>}
      {path.clauses.map((clause, index) =>
        clause.required ? renderRow(clause.rows[0], index, 0) : null
      )}
      {path.clauses.map((clause, index) => {
        if (clause.required) {
          return null
        }
        groupNumber += 1
        const list = renderMemberList(clause.rows, { showAll: shownAll.includes(index) }, t)
        return (
          // Clauses have no identity of their own; their order is the path's.
          // eslint-disable-next-line react/no-array-index-key
          <View key={index} testID={`readout-group-${index}`} style={spacings.mtTy}>
            <View
              style={[
                flexbox.directionRow,
                flexbox.alignCenter,
                flexbox.justifySpaceBetween,
                spacings.mbTy
              ]}
            >
              <Text fontSize={16} weight="medium">
                {t('socialRecovery.shape.group', { n: groupNumber })}
              </Text>
              <View style={[flexbox.directionRow, flexbox.alignCenter]}>
                <Text fontSize={14} style={spacings.mrTy}>
                  {t('socialRecovery.shape.require')}
                </Text>
                <Text
                  fontSize={14}
                  weight="medium"
                  style={spacings.mrTy}
                  testID={`readout-group-${index}-threshold`}
                >
                  {String(clause.threshold)}
                </Text>
                <Text fontSize={14} style={spacings.mrTy}>
                  {t('socialRecovery.shape.of')}
                </Text>
                <Text fontSize={14} weight="medium" testID={`readout-group-${index}-members`}>
                  {String(clause.rows.length)}
                </Text>
              </View>
            </View>
            {list.shown.map((row, member) => renderRow(row, index, member))}
            {!!list.more && (
              <View style={[flexbox.directionRow, flexbox.alignCenter]}>
                <Text fontSize={12} appearance="secondaryText" style={spacings.mrTy}>
                  {list.more}
                </Text>
                <Pressable
                  testID={`readout-group-${index}-show-all`}
                  onPress={() => setShownAll((held) => [...held, index])}
                >
                  <Text fontSize={12} weight="medium" appearance="primary" underline>
                    {t('socialRecovery.review.showAllMembers')}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )
      })}
      {path.ruleLines.map((line, index) => (
        <Text
          // The rule lines are fixed in number and order for one path.
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          fontSize={14}
          style={spacings.mtSm}
          testID={`readout-rule-line-${index}`}
        >
          {line}
        </Text>
      ))}
      <View style={spacings.mtMd} testID="readout-wait">
        <SectionLabel>{t('socialRecovery.display.nouns.waitingPeriod')}</SectionLabel>
        <View style={[flexbox.directionRow, flexbox.alignCenter]}>
          <Text fontSize={14} weight="medium" style={spacings.mrTy} testID="readout-wait-value">
            {path.wait}
          </Text>
          {!!path.waitChip && <StatusChip text={path.waitChip} testID="readout-wait-chip" />}
        </View>
      </View>
    </View>
  )
}

export default React.memo(ReadoutPathBlock)
