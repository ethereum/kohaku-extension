/**
 * The page after the approval exists: nothing has been sent, so the guardian
 * sends the one line back to whoever asked, alone or inside a message that
 * names the account. A guardian who regrets it tells the owner and whoever
 * asked.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { SectionCard, SectionLabel } from '@web/modules/social-recovery/shared/chrome'
import { renderApproval } from '@web/modules/social-recovery/shared/display'

import BrandLine from './BrandLine'
import CopyFeedbackLine from './CopyFeedbackLine'
import { approvalMessageOf } from './signing'
import type { SignedBlockProps } from './types'
import useCopy from './useCopy'
import { fullAddressOf } from './values'

const SIGNED = 'socialRecovery.guardianPage.signed'

const SignedBlock = ({ approval, account }: SignedBlockProps) => {
  const { t } = useTranslation()
  const { feedback, copy } = useCopy()

  return (
    <View testID="guardian-signed">
      <BrandLine />
      <Text fontSize={20} weight="medium" style={spacings.mbTy} testID="guardian-signed-title">
        {t(`${SIGNED}.title`)}
      </Text>
      <Text fontSize={14} style={spacings.mbSm} testID="guardian-signed-body">
        {t(`${SIGNED}.body`)}
      </Text>
      <SectionCard testID="guardian-signed-approval">
        <SectionLabel>{t(`${SIGNED}.heading`)}</SectionLabel>
        <Text fontSize={14} weight="number_medium" testID="guardian-signed-line">
          {renderApproval(approval.proof)}
        </Text>
        <View style={[flexbox.directionRow, flexbox.wrap, spacings.mtSm]}>
          <Button
            testID="guardian-signed-copy"
            type="primary"
            size="small"
            text={t(`${SIGNED}.copy`)}
            onPress={() => copy('approval', approval.line)}
            hasBottomSpacing={false}
            style={[spacings.mrSm, spacings.mbTy]}
          />
          <Button
            testID="guardian-signed-copy-message"
            type="secondary"
            size="small"
            text={t(`${SIGNED}.copyMessage`)}
            onPress={() =>
              copy(
                'message',
                approvalMessageOf(fullAddressOf(account) ?? account, approval.line, t)
              )
            }
            hasBottomSpacing={false}
            style={spacings.mbTy}
          />
        </View>
        <Text fontSize={12} appearance="secondaryText" style={spacings.mbTy}>
          {t(`${SIGNED}.messageHint`)}
        </Text>
        <CopyFeedbackLine feedback={feedback} testID="guardian-signed-copy" />
      </SectionCard>
      <Text fontSize={14} testID="guardian-signed-regret">
        {t(`${SIGNED}.regret`)}
      </Text>
    </View>
  )
}

export default React.memo(SignedBlock)
