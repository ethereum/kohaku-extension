/**
 * The page after the approval exists, the approval's last step: nothing has
 * been sent, so the guardian sends the one line back to whoever asked, alone
 * or inside a message that names the account. Beside it, a guardian who
 * regrets it reads to tell the owner and whoever asked.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { SectionCard, SectionLabel, TwoColumn } from '@web/modules/social-recovery/shared/chrome'
import { renderApproval } from '@web/modules/social-recovery/shared/display'

import BrandLine from './BrandLine'
import CopyFeedbackLine from './CopyFeedbackLine'
import { GUARDIAN_STAGES } from './constants'
import { approvalMessageOf } from './signing'
import StageLine from './StageLine'
import type { SignedBlockProps } from './types'
import useCopy from './useCopy'
import { fullAddressOf } from './values'

const SIGNED = 'socialRecovery.guardianPage.signed'

const SignedBlock = ({ approval, account }: SignedBlockProps) => {
  const { t } = useTranslation()
  const { feedback, copy } = useCopy()

  const aside = (
    <SectionCard
      tone="muted"
      spacing="item"
      label={t(`${SIGNED}.regretTitle`)}
      testID="guardian-signed-regret-card"
    >
      <Text fontSize={12} appearance="secondaryText" testID="guardian-signed-regret">
        {t(`${SIGNED}.regret`)}
      </Text>
    </SectionCard>
  )

  return (
    <TwoColumn testID="guardian-signed-columns" aside={aside}>
      <View testID="guardian-signed">
        <BrandLine />
        <StageLine step={GUARDIAN_STAGES} />
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
          <CopyFeedbackLine feedback={feedback} testID="guardian-signed-copy" />
        </SectionCard>
      </View>
    </TwoColumn>
  )
}

export default React.memo(SignedBlock)
