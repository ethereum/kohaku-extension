/**
 * The saved changes: the transaction that wrote them with its explorer link,
 * the one-transaction line, the stale card line where the edit makes a
 * printed Recovery Card stale with the action that opens the card, and done.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { ActionsRow, SectionCard } from '@web/modules/social-recovery/shared/chrome'
import { renderHash } from '@web/modules/social-recovery/shared/display'

import { EDITOR, REVIEW } from './constants'
import type { ReviewSavedProps } from './types'

const ReviewSaved = ({ transactionHash, onExplorer, stale, onDone, onCard }: ReviewSavedProps) => {
  const { t } = useTranslation()
  return (
    <View testID="manage-review-saved">
      <Text fontSize={20} weight="medium" style={spacings.mbTy} testID="manage-review-saved-title">
        {t(`${REVIEW}.savedTitle`)}
      </Text>
      <Text fontSize={14} appearance="secondaryText" style={spacings.mbSm}>
        {t(`${REVIEW}.savedBody`)}
      </Text>
      <SectionCard>
        {!!transactionHash && (
          <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap, spacings.mbTy]}>
            <Text fontSize={14} weight="number_medium" selectable style={spacings.mrSm}>
              {renderHash(transactionHash)}
            </Text>
            <Button
              testID="manage-review-saved-explorer"
              type="ghost"
              size="small"
              text={t('socialRecovery.arm.explorer')}
              onPress={onExplorer}
              hasBottomSpacing={false}
            />
          </View>
        )}
        <Text fontSize={12} appearance="secondaryText">
          {t('socialRecovery.arm.oneTransaction')}
        </Text>
      </SectionCard>
      {stale && (
        <Text
          fontSize={14}
          weight="medium"
          style={spacings.mbSm}
          testID="manage-review-saved-stale"
        >
          {t(`${EDITOR}.staleCard`)}
        </Text>
      )}
      <ActionsRow
        primary={
          <Button
            testID="manage-review-saved-done"
            type="primary"
            text={t(`${REVIEW}.done`)}
            onPress={onDone}
            hasBottomSpacing={false}
          />
        }
        secondary={
          onCard ? (
            <Button
              testID="manage-review-saved-card"
              type="secondary"
              text={t('socialRecovery.management.overview.card.action')}
              onPress={onCard}
              hasBottomSpacing={false}
            />
          ) : undefined
        }
      />
    </View>
  )
}

export default React.memo(ReviewSaved)
