/** One of the wallet's accounts as a choice: its avatar, its name, its address and the key it installs. */
import React, { useCallback } from 'react'
import { View } from 'react-native'

import Avatar from '@common/components/Avatar'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { RadioCard } from '@web/modules/social-recovery/shared/chrome'
import { renderFullAddress } from '@web/modules/social-recovery/shared/display'

import type { ReceivingRowProps } from './types'

const ReceivingRow = ({ choice, selected, disabled, onSelect }: ReceivingRowProps) => {
  const { t } = useTranslation()
  const { account, address, key, smart } = choice
  const select = useCallback(() => onSelect(address), [onSelect, address])
  const testID = `entry-owner-choice-${address.toLowerCase()}`

  return (
    <RadioCard selected={selected} disabled={disabled} onPress={select} testID={testID}>
      <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mbTy]}>
        <Avatar pfp={account.preferences.pfp} isSmart={smart} size={24} displayTypeBadge={false} />
        <Text fontSize={14} weight="medium" testID={`${testID}-name`}>
          {account.preferences.label || renderFullAddress(address)}
        </Text>
      </View>
      <Text
        fontSize={12}
        weight="number_medium"
        appearance="secondaryText"
        selectable
        style={spacings.mbTy}
        testID={`${testID}-address`}
      >
        {renderFullAddress(address)}
      </Text>
      <Text fontSize={12} appearance="secondaryText">
        {t('socialRecovery.entry.owner.keyFor')}
      </Text>
      <Text fontSize={12} weight="number_medium" selectable testID={`${testID}-key`}>
        {renderFullAddress(key.addr)}
      </Text>
    </RadioCard>
  )
}

export default React.memo(ReceivingRow)
