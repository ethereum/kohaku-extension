/** The line under a copy action: copied, or that the clipboard refused it. */
import React from 'react'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'

import type { CopyFeedbackLineProps } from './types'

const GUARDIAN = 'socialRecovery.checklist.guardian'

const CopyFeedbackLine = ({ feedback, testID }: CopyFeedbackLineProps) => {
  const { t } = useTranslation()
  if (!feedback) {
    return null
  }
  return (
    <Text
      fontSize={12}
      appearance={feedback.copied ? 'successText' : 'errorText'}
      style={spacings.mbTy}
      testID={`${testID}-${feedback.what}-${feedback.copied ? 'copied' : 'failed'}`}
    >
      {t(feedback.copied ? `${GUARDIAN}.copied` : `${GUARDIAN}.copyFailed`)}
    </Text>
  )
}

export default React.memo(CopyFeedbackLine)
