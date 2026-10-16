/** The deposit step's notes that only inform, each as a muted card for the write screen's aside. */
import React from 'react'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import { SectionCard } from '@web/modules/social-recovery/shared/chrome'

import { renderDepositStep } from '../copy'
import type { DepositStepAsideProps } from './types'

const DepositStepAside = ({ step, testID }: DepositStepAsideProps) => {
  const { t } = useTranslation()
  const { aside } = renderDepositStep(step, {}, t)

  if (!aside.length) {
    return null
  }
  return (
    <>
      {aside.map(({ title, line }) => (
        <SectionCard key={line} tone="muted" spacing="item" label={title} testID={testID}>
          <Text fontSize={12} appearance="secondaryText">
            {line}
          </Text>
        </SectionCard>
      ))}
    </>
  )
}

export default React.memo(DepositStepAside)
