/**
 * The checklist's rows: every required row first, then each group under its
 * header, the group's number and its shape as the review states it, then the
 * filled members against the group's threshold, every member shown.
 */
import React from 'react'
import { View } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

import { filledIn } from './rows'
import type { ChecklistRowsProps } from './types'

const ChecklistRows = ({ layout, assessment, renderRow }: ChecklistRowsProps) => {
  const { t } = useTranslation()

  return (
    <View testID="checklist-rows">
      {layout.required.map((row) => (
        <React.Fragment key={row.place}>{renderRow(row)}</React.Fragment>
      ))}
      {layout.groups.map((group) => (
        <View key={group.clause} style={spacings.mtSm} testID={`checklist-group-${group.clause}`}>
          <View
            style={[
              flexbox.directionRow,
              flexbox.alignCenter,
              flexbox.justifySpaceBetween,
              spacings.mbTy
            ]}
            testID={`checklist-group-${group.clause}-shape`}
          >
            <Text fontSize={16} weight="medium">
              {t('socialRecovery.shape.group', { n: group.number })}
            </Text>
            <View style={[flexbox.directionRow, flexbox.alignCenter]}>
              <Text fontSize={14} style={spacings.mrTy}>
                {t('socialRecovery.shape.require')}
              </Text>
              <Text fontSize={14} weight="medium" style={spacings.mrTy}>
                {String(group.threshold)}
              </Text>
              <Text fontSize={14} style={spacings.mrTy}>
                {t('socialRecovery.shape.of')}
              </Text>
              <Text fontSize={14} weight="medium">
                {String(group.rows.length)}
              </Text>
            </View>
          </View>
          <Text
            fontSize={14}
            weight="semiBold"
            style={spacings.mbTy}
            testID={`checklist-group-${group.clause}-progress`}
          >
            {t('socialRecovery.checklist.groupProgress', {
              done: Math.min(filledIn(assessment, group.clause), group.threshold),
              count: group.threshold
            })}
          </Text>
          {group.rows.map((row) => (
            <React.Fragment key={row.place}>{renderRow(row)}</React.Fragment>
          ))}
        </View>
      ))}
    </View>
  )
}

export default React.memo(ChecklistRows)
