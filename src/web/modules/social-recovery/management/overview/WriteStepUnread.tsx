/** A removal that landed and whose check did not answer: it reads again, never as done. */
import React from 'react'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { SectionCard } from '@web/modules/social-recovery/shared/chrome'

import { OVERVIEW } from './constants'
import type { WriteStepUnreadProps } from './types'

const WriteStepUnread = ({ onReread }: WriteStepUnreadProps) => {
  const { t } = useTranslation()
  return (
    <SectionCard spacing="none" testID="overview-step-unread">
      <Text fontSize={14} style={spacings.mbTy} testID="overview-step-unread-line">
        {t(`${OVERVIEW}.reads.failedTitle`)}
      </Text>
      <Button
        testID="overview-step-reread"
        type="secondary"
        size="small"
        text={t('socialRecovery.arm.checkAgain')}
        onPress={onReread}
        hasBottomSpacing={false}
        style={[flexbox.alignSelfStart, spacings.mtTy]}
      />
    </SectionCard>
  )
}

export default React.memo(WriteStepUnread)
