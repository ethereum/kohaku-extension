/**
 * The page after a decline: nothing was signed or sent and nobody is told,
 * so the guardian tells the owner anyway, since a request leaves no trace on
 * chain until someone submits it. The page does not invite the guardian back
 * to approve.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { SectionCard } from '@web/modules/social-recovery/shared/chrome'

import type { DeclinedBlockProps } from './types'

const DECLINED = 'socialRecovery.guardianPage.declined'

const DeclinedBlock = ({ onClose }: DeclinedBlockProps) => {
  const { t } = useTranslation()

  return (
    <View testID="guardian-declined">
      <Text fontSize={12} appearance="secondaryText" testID="guardian-declined-title">
        {t(`${DECLINED}.title`)}
      </Text>
      <Text fontSize={20} weight="medium" style={spacings.mbTy} testID="guardian-declined-headline">
        {t(`${DECLINED}.headline`)}
      </Text>
      <Text fontSize={14} style={spacings.mbSm} testID="guardian-declined-body">
        {t(`${DECLINED}.body`)}
      </Text>
      <SectionCard label={t(`${DECLINED}.tellTitle`)} testID="guardian-declined-tell">
        <Text fontSize={14} style={spacings.mbTy}>
          {t(`${DECLINED}.tellBody`)}
        </Text>
        <Text fontSize={14}>{t(`${DECLINED}.cancelLine`)}</Text>
      </SectionCard>
      <Button
        testID="guardian-declined-close"
        type="secondary"
        text={t(`${DECLINED}.close`)}
        onPress={onClose}
        hasBottomSpacing={false}
        style={spacings.mbSm}
      />
      <Text fontSize={12} appearance="secondaryText" style={spacings.mbTy}>
        {t(`${DECLINED}.sentNothing`)}
      </Text>
      <Text fontSize={12} appearance="secondaryText">
        {t(`${DECLINED}.stillPublishes`)}
      </Text>
    </View>
  )
}

export default React.memo(DeclinedBlock)
