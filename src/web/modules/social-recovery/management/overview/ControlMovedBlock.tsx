/**
 * The account, its controller as the watcher read it from the recovery that
 * moved control, where it read one, and the line that the recovery path no
 * longer covers a key this device holds.
 */
import React from 'react'
import { View } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { renderFullAddress, renderValueLabel } from '@web/modules/social-recovery/shared/display'

import { CONTROL_MOVED } from './constants'
import type { ControlMovedBlockProps } from './types'

const ControlMovedBlock = ({ notice, account }: ControlMovedBlockProps) => {
  const { t } = useTranslation()
  const { controller } = notice
  return (
    <View style={spacings.mbSm} testID="overview-control-moved-notice">
      <View style={spacings.mbTy}>
        <Text fontSize={12} appearance="secondaryText">
          {renderValueLabel('account', t)}
        </Text>
        <Text
          fontSize={14}
          weight="number_medium"
          selectable
          testID="overview-control-moved-account"
        >
          {renderFullAddress(account)}
        </Text>
      </View>
      {!!controller && (
        <View style={spacings.mbTy}>
          <Text fontSize={12} appearance="secondaryText">
            {t(`${CONTROL_MOVED}.controller`)}
          </Text>
          <Text
            fontSize={14}
            weight="number_medium"
            selectable
            testID="overview-control-moved-controller"
          >
            {renderFullAddress(controller)}
          </Text>
        </View>
      )}
      <Text fontSize={14} weight="medium" testID="overview-control-moved-path">
        {t(`${CONTROL_MOVED}.path`)}
      </Text>
    </View>
  )
}

export default React.memo(ControlMovedBlock)
