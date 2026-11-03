/**
 * The page after a decline: nothing was signed or sent and nobody is told,
 * so the guardian tells the owner anyway, since a request leaves no trace on
 * chain until someone submits it. The page does not invite the guardian back
 * to approve. A message to the owner, naming the account and the new key,
 * is one copy away. Beside it, that a recovery completing without the
 * guardian still publishes their address.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { SectionCard, TwoColumn } from '@web/modules/social-recovery/shared/chrome'

import BrandLine from './BrandLine'
import CopyFeedbackLine from './CopyFeedbackLine'
import { declineMessageOf } from './signing'
import type { DeclinedBlockProps } from './types'
import useCopy from './useCopy'
import { fullAddressOf } from './values'

const DECLINED = 'socialRecovery.guardianPage.declined'

const DeclinedBlock = ({ account, newKey, onClose }: DeclinedBlockProps) => {
  const { t } = useTranslation()
  const { feedback, copy } = useCopy()

  const aside = (
    <SectionCard
      tone="muted"
      spacing="item"
      label={t(`${DECLINED}.publishesTitle`)}
      testID="guardian-declined-publishes"
    >
      <Text fontSize={12} appearance="secondaryText" testID="guardian-declined-still-publishes">
        {t(`${DECLINED}.stillPublishes`)}
      </Text>
    </SectionCard>
  )

  return (
    <TwoColumn testID="guardian-declined-columns" aside={aside}>
      <View testID="guardian-declined">
        <BrandLine />
        <Text fontSize={12} appearance="secondaryText" testID="guardian-declined-title">
          {t(`${DECLINED}.title`)}
        </Text>
        <Text
          fontSize={20}
          weight="medium"
          style={spacings.mbTy}
          testID="guardian-declined-headline"
        >
          {t(`${DECLINED}.headline`)}
        </Text>
        <Text fontSize={14} style={spacings.mbSm} testID="guardian-declined-body">
          {t(`${DECLINED}.body`)}
        </Text>
        <SectionCard label={t(`${DECLINED}.tellTitle`)} testID="guardian-declined-tell">
          <Text fontSize={14} style={spacings.mbTy}>
            {t(`${DECLINED}.tellBody`)}
          </Text>
          <Text fontSize={14} style={spacings.mbSm}>
            {t(`${DECLINED}.cancelLine`)}
          </Text>
          <Button
            testID="guardian-declined-copy-message"
            type="primary"
            size="small"
            text={t(`${DECLINED}.copyMessage`)}
            disabled={newKey === null}
            onPress={() => {
              if (newKey !== null) {
                copy('message', declineMessageOf(fullAddressOf(account) ?? account, newKey, t))
              }
            }}
            hasBottomSpacing={false}
            style={spacings.mbTy}
          />
          <CopyFeedbackLine feedback={feedback} testID="guardian-declined-copy" />
        </SectionCard>
        <Button
          testID="guardian-declined-close"
          type="secondary"
          text={t(`${DECLINED}.close`)}
          onPress={onClose}
          hasBottomSpacing={false}
        />
      </View>
    </TwoColumn>
  )
}

export default React.memo(DeclinedBlock)
