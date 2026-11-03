import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { SectionCard, StatusChip } from '@web/modules/social-recovery/shared/chrome'

import type { AlreadySetUpCardProps } from './types'

const ALREADY_SET_UP = 'socialRecovery.review.blocked.alreadySetUp'

/** That the account already has a recovery setup, with the way to the path to edit instead. */
const AlreadySetUpCard = ({ onOpen }: AlreadySetUpCardProps) => {
  const { t } = useTranslation()

  return (
    <SectionCard testID="review-blocked-already-set-up">
      <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap, spacings.mbTy]}>
        <StatusChip
          text={t(`${ALREADY_SET_UP}.chip`)}
          tone="error"
          testID="review-blocked-chip"
          style={spacings.mrSm}
        />
        <Text fontSize={16} weight="medium" testID="review-blocked-title">
          {t(`${ALREADY_SET_UP}.title`)}
        </Text>
      </View>
      <Text
        fontSize={14}
        appearance="secondaryText"
        style={spacings.mbTy}
        testID="review-blocked-body"
      >
        {t(`${ALREADY_SET_UP}.body`)}
      </Text>
      <View style={[flexbox.directionRow, spacings.mtTy]}>
        <Button
          testID="review-blocked-open"
          type="secondary"
          size="small"
          text={t(`${ALREADY_SET_UP}.open`)}
          onPress={onOpen}
          hasBottomSpacing={false}
        />
      </View>
    </SectionCard>
  )
}

export default AlreadySetUpCard
