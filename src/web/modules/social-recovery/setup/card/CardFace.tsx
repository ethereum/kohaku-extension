/**
 * The card itself, the same on screen and in print: the title, the account
 * address whole, the password row the caller renders, and the fixed lines.
 */
import React from 'react'
import { View } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import { renderFullAddress, renderValueLabel } from '@web/modules/social-recovery/shared/display'

import { CARD_LINE_KEYS } from './card'
import type { CardFaceProps } from './types'

const CardFace = ({ account, passwordRow, testID }: CardFaceProps) => {
  const { t } = useTranslation()
  const { theme } = useTheme()

  return (
    <View
      testID={testID}
      style={[
        spacings.ph,
        spacings.pv,
        common.borderRadiusPrimary,
        { borderWidth: 1, borderColor: theme.secondaryBorder }
      ]}
    >
      <Text
        fontSize={12}
        weight="semiBold"
        appearance="secondaryText"
        style={[spacings.mbSm, { textTransform: 'uppercase', letterSpacing: 1 }]}
      >
        {t('socialRecovery.card.cardTitle')}
      </Text>
      <View style={spacings.mbSm}>
        <Text fontSize={12} appearance="secondaryText" style={spacings.mbTy}>
          {renderValueLabel('account', t)}
        </Text>
        <Text testID="card-account" fontSize={14} weight="medium" selectable>
          {renderFullAddress(account)}
        </Text>
      </View>
      {passwordRow}
      {CARD_LINE_KEYS.map((key) => (
        <Text key={key} testID="card-line" fontSize={14} style={spacings.mtTy}>
          {t(key)}
        </Text>
      ))}
    </View>
  )
}

export default React.memo(CardFace)
