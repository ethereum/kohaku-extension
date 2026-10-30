/**
 * The card itself, the same on screen and in print: the title, the account
 * address whole, the password row the caller renders, and the fixed lines.
 * On screen each label sits beside its value; in print it sits above it.
 */
import React from 'react'
import { View } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import { renderFullAddress, renderValueLabel } from '@web/modules/social-recovery/shared/display'

import { CARD_LINE_KEYS } from './card'
import type { CardFaceProps } from './types'

// The label column of a row on the screen's card, shared with the password row.
export const CARD_LABEL_COLUMN = { width: 140 } as const

const CardFace = ({ account, passwordRow, onScreen = false, testID }: CardFaceProps) => {
  const { t } = useTranslation()
  const { theme } = useTheme()

  return (
    <View
      testID={testID}
      style={[
        spacings.phLg,
        spacings.pvMd,
        common.borderRadiusSecondary,
        { borderWidth: 2, borderColor: theme.primaryText }
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
      {onScreen ? (
        <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mbSm]}>
          <Text
            fontSize={12}
            weight="semiBold"
            appearance="secondaryText"
            style={CARD_LABEL_COLUMN}
          >
            {renderValueLabel('account', t)}
          </Text>
          <Text
            testID="card-account"
            fontSize={14}
            weight="number_medium"
            selectable
            style={flexbox.flex1}
          >
            {renderFullAddress(account)}
          </Text>
        </View>
      ) : (
        <View style={spacings.mbSm}>
          <Text fontSize={12} appearance="secondaryText" style={spacings.mbTy}>
            {renderValueLabel('account', t)}
          </Text>
          <Text testID="card-account" fontSize={14} weight="medium" selectable>
            {renderFullAddress(account)}
          </Text>
        </View>
      )}
      {passwordRow}
      {CARD_LINE_KEYS.map((key, index) => {
        const quiet = onScreen && index === CARD_LINE_KEYS.length - 1
        return (
          <Text
            key={key}
            testID="card-line"
            fontSize={quiet ? 12 : 14}
            appearance={quiet ? 'secondaryText' : 'primaryText'}
            style={spacings.mtTy}
          >
            {t(key)}
          </Text>
        )
      })}
    </View>
  )
}

export default React.memo(CardFace)
