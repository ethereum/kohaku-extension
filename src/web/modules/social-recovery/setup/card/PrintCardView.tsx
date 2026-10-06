/**
 * The card as printed: the password in its characters at the hidden level.
 * Mounted under the page's body only while a print runs, and hidden on screen,
 * so the page prints this card and nothing else.
 */
import React from 'react'
import { createPortal } from 'react-dom'
import { View } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { renderPasswordName } from '@web/modules/social-recovery/shared/display'

import CardFace from './CardFace'
import { PRINT_VIEW_CSS, PRINT_VIEW_ID } from './carriers'
import type { PrintCardViewProps } from './types'

const PrintCardView = ({ card }: PrintCardViewProps) => {
  const { t } = useTranslation()

  const passwordRow =
    card.level === 'hidden' ? (
      <View style={spacings.mbSm}>
        <Text fontSize={12} appearance="secondaryText" style={spacings.mbTy}>
          {renderPasswordName('recoveryPassword', t)}
        </Text>
        <Text testID="print-password" fontSize={14} weight="medium">
          {card.password ?? ''}
        </Text>
      </View>
    ) : null

  return createPortal(
    <div id={PRINT_VIEW_ID} data-testid="print-view">
      <style>{PRINT_VIEW_CSS}</style>
      <CardFace account={card.account} passwordRow={passwordRow} testID="print-card" />
    </div>,
    document.body
  )
}

export default React.memo(PrintCardView)
