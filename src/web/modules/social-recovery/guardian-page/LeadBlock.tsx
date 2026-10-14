/**
 * The page's lead: who asks and what approving does, the four values in full,
 * what approving publishes, that anyone holding the request can submit it
 * until its deadline, that the link is not to be forwarded, and the
 * instruction to compare the account and the new key with what the owner
 * read on the call.
 */
import React from 'react'
import { View } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { SectionCard } from '@web/modules/social-recovery/shared/chrome'

import type { LeadBlockProps } from './types'
import ValueLines from './ValueLines'

const LEAD = 'socialRecovery.guardianPage.lead'

const LeadBlock = ({ values }: LeadBlockProps) => {
  const { t } = useTranslation()

  const line = (text: string, testID: string) => (
    <Text fontSize={14} style={spacings.mbSm} testID={testID}>
      {text}
    </Text>
  )

  return (
    <View testID="guardian-lead">
      <Text fontSize={20} weight="medium" style={spacings.mbTy} testID="guardian-lead-title">
        {t(`${LEAD}.title`)}
      </Text>
      {line(t(`${LEAD}.body`), 'guardian-lead-body')}
      <SectionCard testID="guardian-values">
        <ValueLines values={values} testID="guardian-value" />
      </SectionCard>
      {line(t(`${LEAD}.effect`), 'guardian-lead-effect')}
      {line(t(`${LEAD}.publication`), 'guardian-lead-publication')}
      {line(t(`${LEAD}.pathPublic`), 'guardian-lead-path-public')}
      {line(t('socialRecovery.checklist.submittable'), 'guardian-lead-submittable')}
      {line(t(`${LEAD}.noForward`), 'guardian-lead-no-forward')}
      <Text fontSize={14} weight="medium" style={spacings.mbLg} testID="guardian-lead-compare">
        {t(`${LEAD}.compare`)}
      </Text>
    </View>
  )
}

export default React.memo(LeadBlock)
